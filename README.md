# CRM-Webflow Integration Middleware

**Version:** 2.0.0

## 1. Project Overview

This middleware connects a Microsoft Dynamics 365 CRM with a Webflow frontend. It facilitates highly efficient, real-time data synchronization via targeted webhooks and provides robust API endpoints for the frontend to interact with the CRM. The architecture is built around a targeted, single-item synchronization model, making it fast and reliable, and is designed for serverless deployment on Vercel.

## 2. Core Features

* **Targeted Real-time Sync**: Triggers a precise sync for only the single item that was created, updated, or deleted in the CRM, ensuring minimal processing delay.
* **Asynchronous Background Processing**: Uses Vercel's `waitUntil()` function to acknowledge webhooks instantly while processing the synchronization in the background, preventing CRM timeouts.
* **Race Condition Prevention**: Implements a locking mechanism using Vercel KV to prevent duplicate items from being created in Webflow if multiple webhooks for the same new item arrive simultaneously.
* **Resilient API Client**: The Webflow API client includes automatic retries with exponential backoff to handle API rate limits.
* **Robust Payload Parsing**: The sales order endpoint is hardened to correctly parse various formats of incoming JSON.
* **Secure Endpoints**: Protects the webhook with JWT authentication and the frontend APIs with CORS policies.

## 3. System Architecture

The middleware is composed of three main parts:

* **API Endpoints (`/api`)**: A set of serverless functions that handle requests from the Webflow frontend and the CRM.
* **CRM Library (`/lib/crm.js`)**: A library that handles all communication with the Microsoft Dynamics 365 CRM, including authentication and data retrieval/submission.
* **Scripts (`/scripts`)**: A collection of scripts for tasks like running a targeted data synchronization or testing the CRM connection.

## 4. API Endpoints

### 4.1. `POST /api/crm-webhook`

This endpoint listens for targeted `POST` requests from the CRM to trigger a single-item synchronization from the CRM to Webflow.

* **Authentication**: Requires a JWT (JSON Web Token) in the `Authorization` header as a Bearer Token. The token is verified using the `JWT_SECRET` environment variable.
* **Request Body**: The JWT payload is expected to contain the following properties:
    * `entityName` (string, required): The name of the entity that was changed in the CRM.
    * `recordId` (string, required): The ID of the record that was changed.
    * `changeType` (string, required): The type of change that occurred (e.g., "Update", "Create", "Delete").
* **Response**:
    * `202 Accepted`: If the webhook is received successfully, the synchronization is triggered in the background.
    * `401 Unauthorized`: If the JWT is invalid or missing.
    * `405 Method Not Allowed`: If the request method is not `POST`.
    * `400 Bad Request`: If the JWT payload is missing required fields.

### 4.2. `GET /api/event-product`

This endpoint retrieves event products from the CRM based on an `eventId`.

* **Query Parameters**:
    * `eventId` (string, required): The ID of the event to retrieve products for.
* **Response**:
    * `200 OK`: Returns a JSON array of event products.
    * `400 Bad Request`: If the `eventId` query parameter is missing.
    * `500 Internal Server Error`: If there is an error fetching the data from the CRM.

### 4.3. `POST /api/m8_SubmitSalesOrderV2`

This endpoint submits a sales order to the CRM.

* **Request Body**: The request body is expected to be a JSON object containing the sales order data.
* **Response**:
    * `200 OK`: Returns the response from the CRM.
    * `500 Internal Server Error`: If there is an error submitting the sales order to the CRM.

## 5. Scripts

### 5.1. `node lib/crm.js`

This script tests the connection to the CRM by authenticating, running a `WhoAmI` request, and fetching lists of active entities. It saves the output to a log file for inspection.

### 5.2. `node scripts/sync_single.js <event-id> [Create|Update|Delete]`

This script runs the synchronization process for a single, specified event ID. This is useful for debugging or manual intervention. The `changeType` defaults to `Update` if not provided.

## 6. Environment Variables

The following environment variables are required for the application to run:

* `JWT_SECRET`: The secret key used to sign and verify JWTs for the CRM webhook.
* `CRM_TENANT_ID`: The ID of the Azure Active Directory tenant for the CRM.
* `CRM_CLIENT_ID`: The client ID of the application registered in Azure Active Directory.
* `CRM_CLIENT_SECRET`: The client secret of the application registered in Azure Active Directory.
* `CRM_BASE_URL`: The base URL of the Dynamics 365 CRM API.
* `WEBFLOW_API_TOKEN`: The API token for the Webflow project.
* `WEBFLOW_COLLECTION_ID_EVENTS`: The ID of the "Events" collection in Webflow.
* `WEBFLOW_COLLECTION_ID_LOCATIONS`: The ID of the "Locations" collection in Webflow.
* `WEBFLOW_COLLECTION_ID_CATEGORIES`: The ID of the "Categories" collection in Webflow.
* `WEBFLOW_COLLECTION_ID_AIRPORTS`: The ID of the "Airports" collection in Webflow.
* `KV_URL`: The URL for the Vercel KV store.
* `KV_REST_API_URL`: The REST API URL for the Vercel KV store.
* `KV_REST_API_TOKEN`: The read-write token for the Vercel KV store.
* `KV_REST_API_READ_ONLY_TOKEN`: The read-only token for the Vercel KV store.

## 7. Setup and Deployment

1.  **Clone the repository.**
2.  **Install the dependencies:** `npm install`
3.  **Set up Vercel KV**: In your Vercel dashboard, create a KV database and connect it to your project.
4.  **Create a `.env` file** in the root of the project and add the environment variables listed above.
5.  **Deploy to Vercel.** The serverless functions in the `/api` directory will be automatically deployed.