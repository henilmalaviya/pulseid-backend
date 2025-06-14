# PulseID Backend

A secure medical information management system that allows users to register, store medical data, and access it via phone calls through webhooks.

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

## Security Features

- **Rate Limiting**: IP-based rate limiting to prevent abuse
  - OTP endpoints: 3 requests per 15 minutes per IP
  - Verification endpoints: 5 attempts per 15 minutes per IP
- **Secure OTP Generation**: Cryptographically secure 6-digit codes with 5-minute expiry
- **Anti-Enumeration Protection**: Consistent responses regardless of phone number registration status
- **Progressive Account Lockout**: Automatic lockout with exponential backoff after failed attempts
- **Input Validation**: Comprehensive validation for phone numbers and OTP format
- **Privacy-Focused Logging**: Phone numbers are hashed in logs for security

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
- **Rate Limit**: 3 requests per 15 minutes per IP
- **Body**:
  ```json
  {
    "phoneNumber": "string" // Required: Valid phone number (+1234567890 format)
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
  - `400`: Invalid phone number format / Phone number already verified
  - `429`: Too many registration attempts (rate limited)
  - `500`: Internal server error / Failed to send OTP

#### `POST /user/:id/verify`

- **Description**: Verify phone number using OTP received during registration
- **Rate Limit**: 5 attempts per 15 minutes per IP
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
  - `400`: Invalid OTP format / Invalid OTP / No valid verification request found
  - `429`: Too many failed verification attempts (account locked)
  - `500`: Internal server error

---

### Authentication Routes

#### `POST /login`

- **Description**: Begin login process for verified users
- **Rate Limit**: 3 requests per 15 minutes per IP
- **Security**: Anti-enumeration protection - returns same response for registered/unregistered numbers
- **Body**:
  ```json
  {
    "phoneNumber": "string" // Required: Valid phone number
  }
  ```
- **Response**:
  ```json
  {
    "message": "If this number is registered and verified, you'll receive an OTP",
    "loginRequestId": "string" // UUID for login verification (may be dummy for unregistered numbers)
  }
  ```
- **Error Responses**:
  - `400`: Invalid phone number format
  - `429`: Account temporarily locked / Too many OTP requests
  - `500`: Internal server error

#### `POST /login/:id/verify`

- **Description**: Verify login OTP and create session
- **Rate Limit**: 5 attempts per 15 minutes per IP
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
  - `400`: Invalid OTP format / Invalid OTP / Invalid or expired login request
  - `429`: Too many failed attempts (account locked)
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

## Security Implementation Details

### Rate Limiting

- IP-based rate limiting using `hono-rate-limiter`
- Supports various IP headers: `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`
- Returns HTTP 429 with `retryAfter` field when limits exceeded

### OTP Security

- Uses `crypto.randomBytes()` for cryptographically secure generation
- 6-digit codes with 5-minute expiry (reduced from 10 minutes)
- Progressive lockout: 5min → 15min → 30min → 1hr after repeated failures
- Automatic cleanup of expired attempts

### Anti-Enumeration Protection

- Login endpoint returns identical responses for existing/non-existing users
- Dummy OTP generation and timing delays prevent information disclosure
- Security events logged with hashed phone numbers

### Input Validation

- Zod schemas for phone number and OTP format validation
- Phone number format: `+?[1-9]\d{1,14}` (10-15 digits)
- OTP format: exactly 6 digits

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

- **Phone-based Authentication**: Secure OTP verification for registration and login
- **Medical Information Storage**: Comprehensive medical profile management
- **Emergency Access**: Phone call webhook integration for emergency medical info access
- **Rate-Limited Security**: Protection against SMS bombing and brute force attacks
- **Anti-Enumeration**: Privacy protection against phone number discovery
- **Secure Sessions**: HTTP-only cookies with 30-day expiry
- **SMS Integration**: Fast2SMS service for OTP and information delivery
- **Flexible Phone Number Matching**: Handles various international formats
- **Progressive Lockout**: Automatic account protection with exponential backoff
