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
    WSAA_URL:    'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    WSFE_URL:    'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
};

// ── TOKEN EN MEMORIA ────────────────────────────────────────────
let tokenData = { token: null, sign: null, expira: null };

// ── 1. GENERAR TRA ─────────────────────────────────────────────
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

// ── 2. FIRMAR TRA ──────────────────────────────────────────────
function firmarTRA(tra) {
    try {
        const cert    = forge.pki.certificateFromPem(CONFIG.CERT);
        const keyPem  = CONFIG.KEY;

        let privateKey;
        try {
            const decrypted = forge.pki.decryptRsaPrivateKey(keyPem, CONFIG.KEY_PASS);
            if (!decrypted) throw new Error('Contraseña incorrecta');
            privateKey = decrypted;
        } catch (e) {
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
        return pem
            .replace('-----BEGIN PKCS7-----', '')
            .replace('-----END PKCS7-----', '')
            .replace(/\n/g, '');
    } catch (e) {
        throw new Error('Error firmando TRA: ' + e.message);
    }
}

// ── 3. LLAMAR AL WSAA ──────────────────────────────────────────
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
            // Timeout de 30 segundos
            timeout: 30000,
        };

        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('WSAA Response status:', res.statusCode);
                console.log('WSAA Response headers:', JSON.stringify(res.headers));
                console.log('WSAA Response (first 1000):', data.substring(0, 1000));

                if (!data || data.trim() === '') {
                    return reject(new Error('WSAA devolvió respuesta vacía. Status: ' + res.statusCode));
                }
                resolve({ status: res.statusCode, body: data });
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout al conectar con WSAA (30s). Verificar conectividad Railway → afip.gov.ar'));
        });

        req.on('error', (e) => {
            console.error('WSAA Request error (red/TLS):', e.code, e.message);
            reject(new Error('Error de red al llamar WSAA: ' + e.code + ' - ' + e.message));
        });

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
    const tra  = generarTRA();
    const cms  = firmarTRA(tra);

    let wsaaResult;
    try {
        wsaaResult = await llamarWSAA(cms);
    } catch (netErr) {
        throw new Error('No se pudo conectar con WSAA: ' + netErr.message);
    }

    const { status, body: resp } = wsaaResult;

    // Si ARCA devuelve un error HTTP
    if (status !== 200) {
        console.error('WSAA HTTP error status:', status);
        console.error('WSAA error body:', resp.substring(0, 2000));
        throw new Error('WSAA devolvió HTTP ' + status + '. Body: ' + resp.substring(0, 300));
    }

    let parsed;
    try {
        parsed = await xml2js.parseStringPromise(resp, { explicitArray: false });
    } catch (parseErr) {
        console.error('Error parseando XML del WSAA:', parseErr.message);
        console.error('XML recibido completo:', resp.substring(0, 2000));
        throw new Error('Error parseando respuesta WSAA: ' + parseErr.message);
    }

    console.log('WSAA parsed keys:', Object.keys(parsed));

    // Buscar el Envelope con o sin namespace
    const envelope = parsed['soap:Envelope'] || parsed['Envelope'] || parsed['SOAP-ENV:Envelope'];
    if (!envelope) {
        console.error('Respuesta WSAA completa parseada:', JSON.stringify(parsed).substring(0, 1000));
        throw new Error('No se encontró soap:Envelope en la respuesta WSAA. Keys: ' + Object.keys(parsed).join(', '));
    }

    const soapBody = envelope['soap:Body'] || envelope['Body'] || envelope['SOAP-ENV:Body'];
    if (!soapBody) {
        console.error('Envelope keys:', Object.keys(envelope));
        throw new Error('No se encontró soap:Body. Envelope keys: ' + Object.keys(envelope).join(', '));
    }

    // Detectar fault (error SOAP)
    const fault = soapBody['soap:Fault'] || soapBody['Fault'] || soapBody['SOAP-ENV:Fault'];
    if (fault) {
        const faultString = fault['faultstring'] || fault['faultString'] || JSON.stringify(fault);
        throw new Error('SOAP Fault del WSAA: ' + faultString);
    }

    const loginCmsResponse = soapBody['loginCmsResponse'] || soapBody['ns1:loginCmsResponse'];
    if (!loginCmsResponse) {
        console.error('soap:Body keys:', Object.keys(soapBody));
        throw new Error('No se encontró loginCmsResponse. Body keys: ' + Object.keys(soapBody).join(', '));
    }

    const loginReturn = loginCmsResponse['loginCmsReturn'] || loginCmsResponse['return'];
    if (!loginReturn) {
        throw new Error('No se encontró loginCmsReturn. Keys: ' + Object.keys(loginCmsResponse).join(', '));
    }

    const ta = await xml2js.parseStringPromise(loginReturn, { explicitArray: false });

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
            timeout: 30000,
        };

        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout WSFE')); });
        req.on('error', reject);
        req.write(envelope);
        req.end();
    });
}

// ── 6. OBTENER ÚLTIMO NRO COMPROBANTE ─────────────────────────
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
    const fechaHoy     = new Date().toISOString().slice(0, 10).replace(/-/g, '');
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

// ── ENDPOINT: GENERAR FACTURA ──────────────────────────────────
app.post('/facturar', async (req, res) => {
    try {
        const { total, items, vendedor } = req.body;

        if (!total || total <= 0) {
            return res.status(400).json({ error: 'Total inválido' });
        }

        console.log(`📄 Generando factura C por $${total}...`);

        const { token, sign } = await obtenerToken();
        const nroComprobante  = await obtenerUltimoNro(token, sign, 11);
        const resultado       = await autorizarComprobante(token, sign, { total, items, nroComprobante });

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

// ── ENDPOINT: TEST WSAA (diagnóstico) ─────────────────────────
app.get('/test-wsaa', async (req, res) => {
    try {
        console.log('🧪 Test WSAA iniciado...');

        // Verificar variables de entorno
        const checks = {
            CERT_cargado:    !!CONFIG.CERT && CONFIG.CERT.length > 100,
            KEY_cargado:     !!CONFIG.KEY  && CONFIG.KEY.length > 100,
            CUIT:            CONFIG.CUIT,
            PTO_VTA:         CONFIG.PTO_VTA,
            CERT_inicio:     CONFIG.CERT ? CONFIG.CERT.substring(0, 40) : 'NO CARGADO',
            KEY_inicio:      CONFIG.KEY  ? CONFIG.KEY.substring(0, 40)  : 'NO CARGADO',
        };

        console.log('Config checks:', JSON.stringify(checks));

        // Intentar obtener token
        const { token, sign, expira } = await obtenerToken();

        res.json({
            ok:      true,
            mensaje: 'WSAA funcionando correctamente',
            checks,
            token_preview: token ? token.substring(0, 30) + '...' : null,
            sign_preview:  sign  ? sign.substring(0, 30)  + '...' : null,
            expira,
        });
    } catch (err) {
        console.error('❌ Test WSAA falló:', err.message);
        res.status(500).json({
            ok:     false,
            error:  err.message,
            hint:   'Revisar logs de Railway para ver WSAA Response status y body completo',
        });
    }
});

// ── HEALTH CHECK ───────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({
        status:  'GestOK ARCA Server activo',
        version: '1.1.0',
        cuit:    CONFIG.CUIT,
        ptoVta:  CONFIG.PTO_VTA,
    });
});

// ── INICIAR SERVIDOR ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 GestOK ARCA Server corriendo en puerto ${PORT}`);
    console.log(`📋 CUIT: ${CONFIG.CUIT} | Punto de venta: ${CONFIG.PTO_VTA}`);
    console.log(`📋 CERT cargado: ${!!CONFIG.CERT} | KEY cargado: ${!!CONFIG.KEY}`);
});
