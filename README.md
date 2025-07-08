# CRM-Webflow Integration Middleware

**Version:** 1.0.0

## 1. Project Overview

This middleware connects a Microsoft Dynamics 365 CRM with a Webflow frontend. It facilitates data synchronization, real-time updates via webhooks, and allows the frontend to interact with the CRM for tasks like submitting sales orders. The entire application is designed to be deployed as serverless functions on Vercel.

## 2. Core Features

*   **CRM to Webflow Synchronization**: A full, one-way synchronization of events, locations, categories, and airports from the CRM to the Webflow CMS.
*   **Real-time Updates**: A webhook listener that triggers the CRM to Webflow synchronization upon changes in the CRM.
*   **CRM Data Retrieval**: API endpoints to retrieve data from the CRM, such as event products.
*   **Sales Order Submission**: An API endpoint to submit sales orders from the Webflow frontend to the CRM.

## 3. System Architecture

The middleware is composed of three main parts:

*   **API Endpoints (`/api`)**: A set of serverless functions that handle requests from the Webflow frontend and the CRM.
*   **CRM Library (`/lib/crm.js`)**: A library that handles all communication with the Microsoft Dynamics 365 CRM, including authentication and data retrieval/submission.
*   **Scripts (`/scripts`)**: A collection of scripts for tasks like running the full data synchronization or testing the CRM connection.

## 4. API Endpoints

### 4.1. `POST /api/crm-webhook`

This endpoint listens for `POST` requests from the CRM to trigger a full synchronization from the CRM to Webflow.

*   **Authentication**: Requires a JWT (JSON Web Token) in the `Authorization` header as a Bearer Token. The token is verified using the `JWT_SECRET` environment variable.
*   **Request Body**: The request body is expected to be a JSON object with the following properties:
    *   `entityName` (string, required): The name of the entity that was changed in the CRM.
    *   `recordId` (string, required): The ID of the record that was changed.
    *   `changeType` (string, required): The type of change that occurred (e.g., "Update").
*   **Response**:
    *   `202 Accepted`: If the webhook is received successfully, the synchronization is triggered in the background.
    *   `401 Unauthorized`: If the JWT is invalid or missing.
    *   `405 Method Not Allowed`: If the request method is not `POST`.
    *   `400 Bad Request`: If the JWT payload is missing required fields.

### 4.2. `GET /api/event-product`

This endpoint retrieves event products from the CRM based on an `eventId`.

*   **Query Parameters**:
    *   `eventId` (string, required): The ID of the event to retrieve products for.
*   **Response**:
    *   `200 OK`: Returns a JSON array of event products.
    *   `400 Bad Request`: If the `eventId` query parameter is missing.
    *   `500 Internal Server Error`: If there is an error fetching the data from the CRM.

### 4.3. `POST /api/m8_SubmitSalesOrderV2`

This endpoint submits a sales order to the CRM.

*   **Request Body**: The request body is expected to be a JSON object containing the sales order data.
*   **Response**:
    *   `200 OK`: Returns the response from the CRM.
    *   `500 Internal Server Error`: If there is an error submitting the sales order to the CRM.

## 5. Scripts

### 5.1. `npm run crm:test`

This script runs `scripts/test-crm.js` and tests the connection to the CRM by fetching events.

### 5.2. `node scripts/sync_full.js`

This script runs a full, one-way synchronization from the Dynamics CRM to Webflow. It fetches events, locations, categories, and airports from the CRM and creates or updates corresponding items in Webflow.

## 6. Environment Variables

The following environment variables are required for the application to run:

*   `JWT_SECRET`: The secret key used to sign and verify JWTs for the CRM webhook.
*   `CRM_TENANT_ID`: The ID of the Azure Active Directory tenant for the CRM.
*   `CRM_CLIENT_ID`: The client ID of the application registered in Azure Active Directory.
*   `CRM_CLIENT_SECRET`: The client secret of the application registered in Azure Active Directory.
*   `CRM_BASE_URL`: The base URL of the Dynamics 365 CRM API.
*   `WEBFLOW_API_TOKEN`: The API token for the Webflow project.
*   `WEBFLOW_COLLECTION_ID_EVENTS`: The ID of the "Events" collection in Webflow.
*   `WEBFLOW_COLLECTION_ID_LOCATIONS`: The ID of the "Locations" collection in Webflow.
*   `WEBFLOW_COLLECTION_ID_CATEGORIES`: The ID of the "Categories" collection in Webflow.
*   `WEBFLOW_COLLECTION_ID_AIRPORTS`: The ID of the "Airports" collection in Webflow.

## 7. Setup and Deployment

1.  **Clone the repository.**
2.  **Install the dependencies:** `npm install`
3.  **Create a `.env` file** in the root of the project and add the environment variables listed above.
4.  **Deploy to Vercel.** The serverless functions in the `/api` directory will be automatically deployed.