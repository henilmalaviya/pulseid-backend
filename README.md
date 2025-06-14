# PulseID Backend

A medical information management system that allows users to register, store medical data, and access it via phone calls through webhooks.

## Setup

To install dependencies:

```sh
bun install
```

To run:

```sh
bun run dev
```

Open http://localhost:3000

## API Routes

### Health Check

#### `GET /`

- **Description**: Health check endpoint
- **Response**: Returns "PulseID Backend API" text
- **Authentication**: None required

---

### User Registration Routes

#### `POST /user`

- **Description**: Initiate user registration process
- **Body**:
  ```json
  {
    "phoneNumber": "string" // Required: User's phone number
  }
  ```
- **Response**:
  ```json
  {
    "message": "OTP sent successfully",
    "userId": "string" // UUID of created/existing user
  }
  ```
- **Error Responses**:
  - `400`: Phone number is required
  - `500`: Internal server error

#### `POST /user/:id/verify`

- **Description**: Verify phone number using OTP received during registration
- **Parameters**:
  - `id`: User ID (from registration response)
- **Body**:
  ```json
  {
    "otp": "string" // Required: 6-digit OTP code
  }
  ```
- **Response**:
  ```json
  {
    "message": "Phone number verified successfully"
  }
  ```
- **Error Responses**:
  - `400`: OTP is required / Invalid or expired OTP
  - `500`: Internal server error

---

### Authentication Routes

#### `POST /login`

- **Description**: Begin login process for verified users
- **Body**:
  ```json
  {
    "phoneNumber": "string" // Required: Verified phone number
  }
  ```
- **Response**:
  ```json
  {
    "message": "Login OTP sent successfully",
    "loginRequestId": "string" // UUID for login verification
  }
  ```
- **Error Responses**:
  - `400`: Phone number is required / Phone number not verified
  - `404`: User not found
  - `500`: Internal server error

#### `POST /login/:id/verify`

- **Description**: Verify login OTP and create session
- **Parameters**:
  - `id`: Login request ID (from login response)
- **Body**:
  ```json
  {
    "otp": "string" // Required: 6-digit OTP code
  }
  ```
- **Response**:
  ```json
  {
    "message": "Login successful",
    "user": {
      "id": "string",
      "phoneNumber": "string"
    }
  }
  ```
- **Error Responses**:
  - `400`: OTP is required / Invalid or expired OTP
  - `500`: Internal server error

#### `POST /logout`

- **Description**: Logout user and clear session
- **Authentication**: Optional (works with or without valid session)
- **Response**:
  ```json
  {
    "message": "Logged out successfully"
  }
  ```

---

### Profile Management Routes

#### `GET /user/:id`

- **Description**: Get user profile information (public view with authenticated enhancement)
- **Parameters**:
  - `id`: User ID
- **Authentication**: Optional (provides additional data if authenticated as same user)
- **Response (Public)**:
  ```json
  {
    "id": "string",
    "firstName": "string",
    "lastName": "string",
    "bloodType": "string",
    "isPhoneNumberVerified": "boolean"
  }
  ```
- **Response (Authenticated as same user)**:
  ```json
  {
    "id": "string",
    "firstName": "string",
    "lastName": "string",
    "phoneNumber": "string",
    "dateOfBirth": "string",
    "gender": "string",
    "bloodType": "string",
    "allergies": "string",
    "conditions": "string",
    "medications": "string",
    "address": "string",
    "city": "string",
    "state": "string",
    "zip": "string",
    "country": "string",
    "isPhoneNumberVerified": "boolean"
  }
  ```
- **Error Responses**:
  - `404`: User not found
  - `500`: Internal server error

#### `PUT /user/:id`

- **Description**: Update user profile information
- **Parameters**:
  - `id`: User ID
- **Authentication**: Required (can only update own profile)
- **Body** (all fields optional):
  ```json
  {
    "firstName": "string",
    "lastName": "string",
    "dateOfBirth": "string",
    "gender": "string",
    "bloodType": "string",
    "allergies": "string",
    "conditions": "string",
    "medications": "string",
    "address": "string",
    "city": "string",
    "state": "string",
    "zip": "string",
    "country": "string"
  }
  ```
- **Response**:
  ```json
  {
    "message": "User updated successfully",
    "user": {
      /* full user object */
    }
  }
  ```
- **Error Responses**:
  - `400`: No valid fields to update
  - `401`: Authentication required
  - `403`: Unauthorized (trying to update another user's profile)
  - `500`: Internal server error

---

### Webhook Routes

#### `GET /webhook/exotel/incoming-call`

- **Description**: Handle incoming call webhooks from Exotel service
- **Query Parameters**: Varies based on Exotel webhook format (e.g., `CallFrom`, `From`, etc.)
- **Authentication**: None (webhook endpoint)
- **Response**:
  ```json
  {
    "status": "success",
    "message": "User found and SMS sent" | "User not found, notification SMS sent" | "Webhook processed",
    "smsSent": "boolean" // if SMS was attempted
  }
  ```
- **Error Responses**:
  - `200` with error status (maintains webhook compatibility)

---

## Database Schema

The application uses Prisma with PostgreSQL and includes these main models:

- **User**: Stores user information, medical data, and contact details
- **Session**: Manages user authentication sessions (30-day expiry)
- **PhoneVerification**: Temporary OTP storage for phone verification
- **LoginVerificationRequest**: Temporary OTP storage for login

## Environment Variables

Required environment variables:

```env
DATABASE_URL="postgres://username:password@host:port/database"
FAST2SMS_API_KEY="your-fast2sms-api-key"
FAST2SMS_SENDER_ID="FSTSMS"
```

## Features

- **Phone-based Authentication**: OTP verification for registration and login
- **Medical Information Storage**: Comprehensive medical profile management
- **Emergency Access**: Phone call webhook integration for emergency medical info access
- **Secure Sessions**: HTTP-only cookies with 30-day expiry
- **SMS Integration**: Fast2SMS service for OTP and information delivery
- **Flexible Phone Number Matching**: Handles various international formats
