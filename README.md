Middleware für Microsoft CRM und Webflow
Version: 0.1 (Webhook Listener)

1. Einführung
Dieses Dokument beschreibt die Middleware, die als Brücke zwischen einem Microsoft CRM System und einer Webflow Webseite fungiert. Die Middleware ermöglicht die Synchronisation von Daten aus dem CRM in Webflow und reagiert auf Änderungen im CRM über Webhooks, um Webflow entsprechend zu aktualisieren.

Die aktuelle Version implementiert einen Webhook-Listener, der Benachrichtigungen vom Microsoft CRM über Änderungen entgegennimmt.

2. Aktuelle Implementierung: CRM Webhook Listener
2.1 Endpunkt
[EURE_VERCEL_ENDPOINT_URL]/api/crm-webhook
Dieser Endpunkt akzeptiert POST-Requests von dem Microsoft CRM System, um über Änderungen an Entitäten zu informieren.

2.2 Authentifizierung
Die Authentifizierung erfolgt über JWT (JSON Web Tokens). Das CRM-System muss ein signiertes JWT im Authorization-Header des POST-Requests als Bearer-Token übermitteln.

Beispiel Header:

Authorization: Bearer <DAS_GENERIERTE_JWT>
Die Middleware verifiziert die Signatur des JWT mit einem geheimen Schlüssel (JWT_SECRET), der als Umgebungsvariable auf der Hosting-Plattform (z.B., Vercel) hinterlegt ist.

2.3 Request Body
Der Body des POST-Requests kann leer sein, da die relevanten Informationen im Payload des JWT enthalten sind.

2.4 JWT Payload
Der Payload des JWT sollte die Informationen über die Änderung enthalten:

JSON

{
  "entityName": "Event",
  "recordId": "GUID_DES_DATENSATZES",
  "changeType": "Update",
  // ... weitere optionale Claims
}
2.5 Response
Erfolg (200 OK):

JSON

{
  "status": "success",
  "message": "Webhook received and processed.",
  "data": {
    "entityName": "Event",
    "recordId": "GUID_DES_DATENSATZES",
    "changeType": "Update"
  }
}
Fehler (401 Unauthorized):

JSON

{
  "status": "error",
  "message": "Unauthorized: Invalid token."
}
oder

JSON

{
  "status": "error",
  "message": "Unauthorized: No Bearer token."
}
3. Zukünftige Pläne: Vollständige Middleware
Die zukünftige Entwicklung dieser Middleware zielt darauf ab, eine bidirektionale Integration zwischen Microsoft CRM und Webflow zu ermöglichen. Dies umfasst die folgenden Funktionalitäten:

3.1 Daten-Synchronisation vom CRM zu Webflow
Die Middleware wird in regelmäßigen Abständen oder auf Anfrage Daten aus dem Microsoft CRM abrufen und diese in das Webflow CMS einspeisen. Die folgenden CRM-Endpunkte werden hierfür genutzt:

m8_GetEventsV1: Abrufen von Events zur Anzeige auf der Webseite.
Input: Array von Event Ids (optional)
Output: Array von Events mit allen benötigten Eigenschaften
m8_GetEventPriceLevelV1: Abrufen von Preisinformationen für spezifische Events.
Input: Event Id
Output: Preisliste und Preislistenelemente des Events
m8_GetEventCategoriesV1: Abrufen von Event-Kategorien zur Organisation und Filterung.
Input: Array von Event Category Ids (optional)
Output: Array von Event Categories mit allen benötigten Eigenschaften
m8_GetEventLocationsV1: Abrufen von Veranstaltungsorten zur Anzeige.
Input: Array von Event Location Ids (optional)
Output: Array von Event Locations mit allen benötigten Eigenschaften
m8_GetAirportsV1: Abrufen von Flughäfen (falls relevant für die Events/Locations).
Input: Array von Airports Ids (optional)
Output: Array von Airports mit allen benötigten Eigenschaften
Die Middleware wird diese Daten transformieren und über die Webflow API in die entsprechenden Webflow CMS Collections schreiben oder aktualisieren.

3.2 Verarbeitung von Webhook-Benachrichtigungen
Die aktuelle Implementierung des Webhook-Listeners wird erweitert, um basierend auf den empfangenen Benachrichtigungen (Entity Name, Record Id, Change Type) spezifische Aktionen in Webflow auszulösen. Zum Beispiel:

Bei einer Create oder Update Benachrichtigung für ein Event wird die Middleware die Details des Events über m8_GetEventsV1 abrufen und das entsprechende CMS Item in Webflow aktualisieren oder neu erstellen.
Bei einer Delete Benachrichtigung wird das entsprechende CMS Item in Webflow archiviert oder gelöscht.
Ähnliche Logiken werden für andere Entitäten wie EventCategory und EventLocation implementiert.
3.3 Übermittlung von Daten von Webflow zum CRM
In Zukunft könnte die Middleware auch Funktionen implementieren, um Daten von Webflow zurück zum CRM zu senden, z.B. über den folgenden Endpunkt:

m8_SubmitSalesOrderV2: Übermittlung von Buchungen oder Bestellungen.
Input: Objekt mit den Eigenschaften, customer, eventParticipants, productPriceLevels
Output: HTTP Code, Erfolg oder Fehler mit Code
Dies würde beispielsweise die Übertragung von Event-Buchungen, die über ein Webflow-Formular getätigt wurden, in das CRM ermöglichen.

4. Fazit
Diese Middleware bildet die Grundlage für eine umfassende Integration zwischen Microsoft CRM und Webflow. Die aktuelle Webhook-Implementierung ermöglicht bereits eine reaktive Aktualisierung von Webflow basierend auf CRM-Änderungen. Die zukünftigen Erweiterungen werden eine vollständige Daten-Synchronisation und potenziell die Übermittlung von Daten in beide Richtungen ermöglichen.