const express    = require('express');
const cors       = require('cors');
const https      = require('https');
const xml2js     = require('xml2js');
const forge      = require('node-forge');
const fs         = require('fs');
const path       = require('path');

const app  = express();
app.use(cors());
app.use(express.json());

// ── CONFIGURACIÓN ──────────────────────────────────────────────
// Reemplazar \n literales por saltos de línea reales
// (Railway convierte los saltos de línea en \n al guardar variables)
function fixPem(str) {
    if (!str) return str;
    return str.replace(/\\n/g, '\n');
}

const CONFIG = {
    CUIT:        process.env.CUIT        || '20328508797',
    PTO_VTA:     parseInt(process.env.PTO_VTA || '3'),
    CERT:        fixPem(process.env.CERT),
    KEY:         fixPem(process.env.KEY),
    KEY_PASS:    process.env.KEY_PASS || 'gestok2024',
    // WSAA = autenticación, WSFE = facturación
    WSAA_URL:    'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    WSFE_URL:    'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
};

// ── TOKEN EN MEMORIA ────────────────────────────────────────────
let tokenData = { token: null, sign: null, expira: null };

// ── 1. GENERAR TRA (Login Ticket Request) ──────────────────────
function generarTRA() {
    const ahora       = new Date();
    const generacion  = new Date(ahora.getTime() - 60000).toISOString().replace(/\.\d{3}Z$/, '-03:00');
    const expiracion  = new Date(ahora.getTime() + 3600000 * 10).toISOString().replace(/\.\d{3}Z$/, '-03:00');

    return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId>
    <generationTime>${generacion}</generationTime>
    <expirationTime>${expiracion}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>`;
}

// ── 2. FIRMAR TRA CON CERTIFICADO ──────────────────────────────
function firmarTRA(tra) {
    try {
        const cert    = forge.pki.certificateFromPem(CONFIG.CERT);
        const keyPem  = CONFIG.KEY;

        // Desencriptar la clave privada con la contraseña
        let privateKey;
        try {
            const encryptedKey = forge.pem.decode(keyPem)[0];
            const decrypted    = forge.pki.decryptRsaPrivateKey(keyPem, CONFIG.KEY_PASS);
            if (!decrypted) throw new Error('Contraseña incorrecta para la clave privada');
            privateKey = decrypted;
        } catch (e) {
            // Intentar sin contraseña
            privateKey = forge.pki.privateKeyFromPem(keyPem);
        }

        const p7 = forge.pkcs7.createSignedData();
        p7.content = forge.util.createBuffer(tra, 'utf8');
        p7.addCertificate(cert);
        p7.addSigner({
            key:         privateKey,
            certificate: cert,
            digestAlgorithm: forge.pki.oids.sha256,
            authenticatedAttributes: [
                { type: forge.pki.oids.contentType,   value: forge.pki.oids.data },
                { type: forge.pki.oids.messageDigest              },
                { type: forge.pki.oids.signingTime,  value: new Date() },
            ],
        });
        p7.sign();

        const pem = forge.pkcs7.messageToPem(p7);
        // Extraer solo el base64 (sin headers PEM)
        return pem
            .replace('-----BEGIN PKCS7-----', '')
            .replace('-----END PKCS7-----', '')
            .replace(/\n/g, '');
    } catch (e) {
        throw new Error('Error firmando TRA: ' + e.message);
    }
}

// ── 3. LLAMAR AL WSAA PARA OBTENER TOKEN ───────────────────────
function llamarWSAA(cms) {
    return new Promise((resolve, reject) => {
        const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov.ar">
      <in0>${cms}</in0>
    </loginCms>
  </soap:Body>
</soap:Envelope>`;

        const url     = new URL(CONFIG.WSAA_URL);
        const options = {
            hostname: url.hostname,
            path:     url.pathname,
            method:   'POST',
            headers:  {
                'Content-Type':   'text/xml; charset=utf-8',
                'SOAPAction':     '',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ── 4. OBTENER O RENOVAR TOKEN ──────────────────────────────────
async function obtenerToken() {
    const ahora = new Date();
    if (tokenData.token && tokenData.expira && ahora < tokenData.expira) {
        return tokenData;
    }

    console.log('🔑 Renovando token ARCA...');
    const tra    = generarTRA();
    const cms    = firmarTRA(tra);
    const resp   = await llamarWSAA(cms);
    const parsed = await xml2js.parseStringPromise(resp, { explicitArray: false });

    const loginReturn = parsed['soap:Envelope']['soap:Body']['loginCmsResponse']['loginCmsReturn'];
    const ta          = await xml2js.parseStringPromise(loginReturn, { explicitArray: false });

    tokenData = {
        token:  ta.loginTicketResponse.credentials.token,
        sign:   ta.loginTicketResponse.credentials.sign,
        expira: new Date(ta.loginTicketResponse.header.expirationTime),
    };

    console.log('✅ Token obtenido, expira:', tokenData.expira);
    return tokenData;
}

// ── 5. LLAMAR AL WSFE ──────────────────────────────────────────
function llamarWSFE(soapBody) {
    return new Promise((resolve, reject) => {
        const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>${soapBody}</soap:Body>
</soap:Envelope>`;

        const url     = new URL(CONFIG.WSFE_URL);
        const options = {
            hostname: url.hostname,
            path:     url.pathname,
            method:   'POST',
            headers:  {
                'Content-Type':   'text/xml; charset=utf-8',
                'SOAPAction':     '',
                'Content-Length': Buffer.byteLength(envelope),
            },
        };

        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.write(envelope);
        req.end();
    });
}

// ── 6. OBTENER ÚLTIMO NÚMERO DE COMPROBANTE ────────────────────
async function obtenerUltimoNro(token, sign, tipoComprobante) {
    const body = `
<FECompUltimoAutorizado xmlns="http://ar.gov.afip.dif.FEV1/">
  <Auth>
    <Token>${token}</Token>
    <Sign>${sign}</Sign>
    <Cuit>${CONFIG.CUIT}</Cuit>
  </Auth>
  <PtoVta>${CONFIG.PTO_VTA}</PtoVta>
  <CbteTipo>${tipoComprobante}</CbteTipo>
</FECompUltimoAutorizado>`;

    const resp   = await llamarWSFE(body);
    const parsed = await xml2js.parseStringPromise(resp, { explicitArray: false });
    const result = parsed['soap:Envelope']['soap:Body']['FECompUltimoAutorizadoResponse']['FECompUltimoAutorizadoResult'];

    if (result.Errors) {
        throw new Error('Error WSFE: ' + JSON.stringify(result.Errors));
    }

    return parseInt(result.CbteNro) + 1;
}

// ── 7. AUTORIZAR COMPROBANTE ───────────────────────────────────
async function autorizarComprobante(token, sign, datos) {
    const fechaHoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    // Calcular importe neto (Factura C: sin discriminar IVA)
    const importeTotal = parseFloat(datos.total).toFixed(2);

    const body = `
<FECAESolicitar xmlns="http://ar.gov.afip.dif.FEV1/">
  <Auth>
    <Token>${token}</Token>
    <Sign>${sign}</Sign>
    <Cuit>${CONFIG.CUIT}</Cuit>
  </Auth>
  <FeCAEReq>
    <FeCabReq>
      <CantReg>1</CantReg>
      <PtoVta>${CONFIG.PTO_VTA}</PtoVta>
      <CbteTipo>11</CbteTipo>
    </FeCabReq>
    <FeDetReq>
      <FECAEDetRequest>
        <Concepto>1</Concepto>
        <DocTipo>99</DocTipo>
        <DocNro>0</DocNro>
        <CbteDesde>${datos.nroComprobante}</CbteDesde>
        <CbteHasta>${datos.nroComprobante}</CbteHasta>
        <CbteFch>${fechaHoy}</CbteFch>
        <ImpTotal>${importeTotal}</ImpTotal>
        <ImpTotConc>0.00</ImpTotConc>
        <ImpNeto>${importeTotal}</ImpNeto>
        <ImpOpEx>0.00</ImpOpEx>
        <ImpIVA>0.00</ImpIVA>
        <ImpTrib>0.00</ImpTrib>
        <MonId>PES</MonId>
        <MonCotiz>1</MonCotiz>
      </FECAEDetRequest>
    </FeDetReq>
  </FeCAEReq>
</FECAESolicitar>`;

    const resp   = await llamarWSFE(body);
    const parsed = await xml2js.parseStringPromise(resp, { explicitArray: false });
    const result = parsed['soap:Envelope']['soap:Body']['FECAESolicitarResponse']['FECAESolicitarResult'];

    if (result.Errors) {
        throw new Error('Error AFIP: ' + JSON.stringify(result.Errors));
    }

    const detalle = result.FeDetResp.FECAEDetResponse;

    if (detalle.Resultado !== 'A') {
        const obs = detalle.Observaciones
            ? JSON.stringify(detalle.Observaciones)
            : 'Sin observaciones';
        throw new Error('Factura rechazada: ' + obs);
    }

    return {
        cae:            detalle.CAE,
        vencimientoCAE: detalle.CAEFchVto,
        nroComprobante: datos.nroComprobante,
        resultado:      detalle.Resultado,
    };
}

// ── ENDPOINT PRINCIPAL: GENERAR FACTURA ────────────────────────
app.post('/facturar', async (req, res) => {
    try {
        const { total, items, vendedor } = req.body;

        if (!total || total <= 0) {
            return res.status(400).json({ error: 'Total inválido' });
        }

        console.log(`📄 Generando factura C por $${total}...`);

        // 1. Obtener token
        const { token, sign } = await obtenerToken();

        // 2. Obtener próximo número de comprobante
        const nroComprobante = await obtenerUltimoNro(token, sign, 11); // 11 = Factura C

        // 3. Autorizar comprobante
        const resultado = await autorizarComprobante(token, sign, {
            total,
            items,
            nroComprobante,
        });

        console.log(`✅ Factura C N° ${nroComprobante} autorizada. CAE: ${resultado.cae}`);

        res.json({
            ok:             true,
            nroComprobante: nroComprobante,
            cae:            resultado.cae,
            vencimientoCAE: resultado.vencimientoCAE,
            ptoVta:         CONFIG.PTO_VTA,
            cuit:           CONFIG.CUIT,
            tipo:           'Factura C',
        });

    } catch (err) {
        console.error('❌ Error facturando:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── HEALTH CHECK ───────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({
        status:  'GestOK ARCA Server activo',
        version: '1.0.0',
        cuit:    CONFIG.CUIT,
        ptoVta:  CONFIG.PTO_VTA,
    });
});

// ── INICIAR SERVIDOR ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 GestOK ARCA Server corriendo en puerto ${PORT}`);
    console.log(`📋 CUIT: ${CONFIG.CUIT} | Punto de venta: ${CONFIG.PTO_VTA}`);
});
