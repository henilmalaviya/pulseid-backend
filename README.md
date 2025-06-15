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
- **Token-Based Authentication**: JWT-style session tokens sent via Authorization header for secure API access

## Authentication System

This API uses **header-based authentication** with session tokens:

- **Login Process**: Users receive a `sessionToken` after successful OTP verification
- **API Requests**: Include session token in `Authorization: Bearer <token>` header
- **Session Management**: Tokens expire after 30 days and can be revoked via logout
- **Security**: No cookies used, making it compatible with CORS and mobile applications

### Frontend Integration Example

```javascript
// After successful login, store the token
localStorage.setItem("sessionToken", data.sessionToken);

// Include token in API requests
fetch("/user/123", {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${sessionToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(updateData),
});
```

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
    "sessionToken": "string", // Session token for authentication
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

- **Description**: Logout user and invalidate session token
- **Authentication**: Optional - include `Authorization: Bearer <token>` header to invalidate specific session
- **Headers**:
  ```
  Authorization: Bearer <sessionToken> // Optional: token to invalidate
  ```
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
- **Authentication**: Optional - include `Authorization: Bearer <token>` header for enhanced data
- **Headers (Optional)**:
  ```
  Authorization: Bearer <sessionToken> // For authenticated access to full profile
  ```
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
- **Authentication**: Required - must include valid session token
- **Headers**:
  ```
  Authorization: Bearer <sessionToken> // Required
  Content-Type: application/json
  ```
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

### Session Token Security

- **Token Format**: UUID-based session identifiers (not JWT for database validation)
- **Storage**: Session tokens stored in database with expiry timestamps
- **Validation**: Each request validates token existence and expiry
- **Revocation**: Tokens can be invalidated through logout or database cleanup
- **Expiry**: 30-day session lifetime with automatic cleanup of expired sessions

## Database Schema

The application uses Prisma with PostgreSQL and includes these main models:

- **User**: Stores user information, medical data, and contact details
- **Session**: Manages user authentication sessions (30-day expiry)
- **PhoneVerification**: Temporary OTP storage for phone verification
- **LoginVerificationRequest**: Temporary OTP storage for login

## Environment Variables

Required environment variables:

```env
# Database Configuration
DATABASE_URL="postgres://username:password@host:port/database"

# SMS Service Configuration
FAST2SMS_API_KEY="your-fast2sms-api-key"
FAST2SMS_SENDER_ID="FSTSMS"

# CORS Configuration (comma-separated origins)
ALLOWED_ORIGINS="http://localhost:5500,http://127.0.0.1:5500,https://yourdomain.com"

# Environment
NODE_ENV="development" # or "production"
```

## Features

- **Phone-based Authentication**: Secure OTP verification for registration and login
- **Token-Based Sessions**: Header-based authentication using session tokens
- **Medical Information Storage**: Comprehensive medical profile management
- **Emergency Access**: Phone call webhook integration for emergency medical info access
- **Rate-Limited Security**: Protection against SMS bombing and brute force attacks
- **Anti-Enumeration**: Privacy protection against phone number discovery
- **Cross-Origin Support**: CORS-enabled API with configurable origins
- **SMS Integration**: Fast2SMS service for OTP and information delivery
- **Flexible Phone Number Matching**: Handles various international formats
- **Progressive Lockout**: Automatic account protection with exponential backoff
