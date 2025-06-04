# Middleware für CRM-Webflow Integration  
**Version:** 0.1 (Webhook Listener)

## 1. Einführung
Diese Middleware verbindet Microsoft CRM und Webflow für Datensynchronisation und Echtzeit-Updates via Webhooks. Die Codebasis besteht aus zwei JavaScript-Dateien: `api/crm-webhook.js` für den Webhook-Handler und `scripts/crm-test.js` für einfache API-Tests.

## 2. CRM Webhook Listener

### 2.1 Endpunkt
`[EURE_VERCEL_ENDPOINT_URL]/api/crm-webhook`
Akzeptiert `POST`-Requests vom CRM für Änderungsbenachrichtigungen.

### 2.2 Authentifizierung  
JWT (JSON Web Tokens) im `Authorization`-Header als Bearer-Token.  

**Beispiel Header:**  
```
Authorization: Bearer <DAS_GENERIERTE_JWT>
```

Die Signatur wird mit der Umgebungsvariable `JWT_SECRET` verifiziert.

### 2.3 Request Body  
Kann leer sein; relevante Daten befinden sich im JWT-Payload.

### 2.4 JWT Payload  
JSON-Objekt mit Änderungsdetails:

```json
{
  "entityName": "Event",        
  "recordId": "GUID_DES_DATENSATZES",
  "changeType": "Update"
}
```

> **Hinweis:** Fehlende Felder führen zu HTTP 400.

### 2.5 Response  

**Erfolg (200 OK):**  
```json
{
  "status": "success",
  "message": "Webhook received and processed.",
  "data": {
    "entityName": "...",
    "recordId": "...",
    "changeType": "..."
  }
}
```

**Fehlerfälle:**  
- **401 Unauthorized**: Ungültiges oder fehlendes Token  
- **405 Method Not Allowed**: Bei Verwendung einer anderen HTTP-Methode  
- **400 Bad Request**: Fehlende oder fehlerhafte Felder im JWT-Payload  

## 3. CRM Testskript
Ein kleines Testskript (`scripts/crm-test.js`) lässt sich mit `npm run crm:test` ausführen.
Es ruft das CRM-Endpunkt `m8_GetEventsV1` auf. Die benötigten
Konfigurationswerte befinden sich in `.env.example`.

## 4. Zukünftige Pläne

- **CRM zu Webflow Sync**  
  Regelmäßiges oder manuelles Abrufen und Einspeisen von Daten (Events, Preise, Kategorien, Orte, Flughäfen) über CRM-Endpunkte (z. B. `m8_GetEventsV1`) ins Webflow CMS.  

- **Webhook Verarbeitung**  
  Auslösen spezifischer Webflow-Aktionen basierend auf CRM-Änderungen (z. B. Erstellen, Aktualisieren oder Löschen von CMS Items).  

- **Webflow zu CRM**  
  Rückübermittlung von Daten aus Webflow an das CRM-System (z. B. Buchungen über `m8_SubmitSalesOrderV2`).  

## 5. Fazit  
Die aktuelle Version bildet die Grundlage für eine umfassende Integration von Microsoft CRM und Webflow. Mit dem implementierten Webhook können reaktive Updates realisiert werden.  
Zukünftige Schritte beinhalten bidirektionalen Datenaustausch und vollständige Automatisierung der Integration.
