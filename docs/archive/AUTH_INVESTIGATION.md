# Authentication Investigation & Solution

## Problem
The seek bot failed with error:
```
❌ API request failed: No authentication token available. Please login first.
```

## Root Cause Analysis

### 1. Authentication Flow
The bot uses **corpus-rag** API server for AI-powered cover letter generation:
- **Server Location**: `http://[SERVER_IP]:3000` (deployed remotely)
- **Auth System**: Session-based authentication via MongoDB
- **Token Storage**: `.cache/api_token.txt` and `.cache/jwt_tokens.json`

### 2. Token Flow
```
Bot Process (finalboss) 
  → api_client.ts → getAccessToken()
    → Check .cache/jwt_tokens.json
      → If expired: refresh using refresh token
      → If no JWT: convert session token to JWT
    → Check .cache/api_token.txt (session token)
      → Send to /api/auth/session-to-jwt
    → Use JWT access token for API calls
```

### 3. What Went Wrong
The error message "No authentication token available" comes from `api_client.ts:146`:
```typescript
if (!token) {
  throw new Error('No authentication token available. Please login first.');
}
```

This happens when:
1. JWT is expired (`expiresAt` in the past)
2. Refresh token fails
3. Session token conversion fails
4. No tokens found in `.cache/`

## Investigation Results

### ✅ Server Status
```bash
$ curl -s http://[SERVER_IP]:3000/
```
**Result**: Server is UP and running

### ✅ Session Token Found
**Location**: `/home/wagle/inquisitive_mind/finalboss/.cache/api_token.txt`
**Value**: `[REDACTED_SESSION_TOKEN]`

### ✅ Session Token Validity
```bash
$ curl -X GET "http://[SERVER_IP]:3000/api/jobs/hierarchy" \
  -H "Authorization: Bearer [YOUR_SESSION_TOKEN]"
```
**Result**: `{"success":true,...}` ✅ **Token is VALID**

### ❌ JWT Token Expired
**Location**: `/home/wagle/inquisitive_mind/finalboss/.cache/jwt_tokens.json`
**Expiry**: `1761856485284` (October 30, 2025 - EXPIRED)
**Issue**: JWT expired, needs refresh

## Solution

The cached session token **IS valid** and the server **IS accessible**. The issue is that the bot's API client is trying to use an expired JWT instead of the valid session token.

### Option 1: Delete Expired JWT (Recommended)
Force the API client to re-convert the session token to a fresh JWT:

```bash
cd /home/wagle/inquisitive_mind/finalboss
rm .cache/jwt_tokens.json
```

Next run, the API client will:
1. Find no JWT in cache
2. Read valid session token from `.cache/api_token.txt`
3. Convert it to fresh JWT via `/api/auth/session-to-jwt`
4. Cache new JWT and use it

### Option 2: Set API Base URL
Ensure the bot uses the production server:

```bash
# In finalboss directory
export API_BASE=http://[SERVER_IP]:3000
bun bot_starter.ts seek
```

Or add to finalboss/.env:
```env
API_BASE=http://[SERVER_IP]:3000
```

### Option 3: Get Fresh Session Token (If needed)
If session token is also expired, login via UI:

1. Start the finalboss UI:
   ```bash
   cd /home/wagle/inquisitive_mind/finalboss
   bun run dev
   ```

2. Open browser: `http://localhost:1420`

3. Login with Google (puskarwagle17@gmail.com)

4. Token will be saved to `.cache/api_token.txt` automatically

## Corpus-RAG API Details

### Authentication System
- **Primary**: Session-based (MongoDB sessions collection)
- **Secondary**: JWT (for stateless API calls)
- **Login**: Google OAuth via `/api/auth/login-json`
- **Token Lifetime**: 7 days (sessions), 15 minutes (JWT access), 30 days (JWT refresh)

### Cover Letter Endpoint
```http
POST /api/cover_letter
Authorization: Bearer <SESSION_TOKEN or JWT>
Content-Type: application/json

{
  "job_id": "seek_88229139",
  "job_details": "Software Engineer position...",
  "resume_text": "My resume...",
  "useAi": "deepseek-chat",
  "platform": "seek",
  "platform_job_id": "88229139",
  "job_title": "Software Engineer",
  "company": "Real Time"
}
```

### Response
```json
{
  "success": true,
  "cover_letter": "Dear Hiring Manager,\n\n..."
}
```

## File Locations

### finalboss (Bot Application)
```
/home/wagle/inquisitive_mind/finalboss/
├── .cache/
│   ├── api_token.txt          # Session token (valid)
│   └── jwt_tokens.json        # JWT tokens (expired)
├── .env                        # API_BASE config
├── src/bots/
│   ├── core/api_client.ts     # Auth logic
│   └── seek/handlers/cover_letter_handler.ts  # Uses API
```

### corpus-rag (API Server)
```
/home/wagle/inquisitive_mind/corpus-rag/
├── .env                        # Server config
├── src/routes/api/
│   ├── cover_letter/+server.ts        # Cover letter endpoint
│   ├── auth/login-json/+server.ts    # Google login
│   └── auth/session-to-jwt/+server.ts # Token conversion
├── src/lib/
│   ├── auth-middleware.ts     # Session validation
│   └── models/session.ts      # Session management
```

## Environment Variables

### finalboss/.env
```env
API_BASE=http://[SERVER_IP]:3000
PUBLIC_API_BASE=http://[SERVER_IP]:3000
VITE_API_BASE=http://[SERVER_IP]:3000
```

### corpus-rag/.env
```env
# MongoDB (shared with bot)
MONGODB_URI=mongodb://[SERVER_IP]:27017
MONGODB_DB_NAME=[DATABASE_NAME]

# AI Provider Keys
DEEPSEEK_API_KEY=[YOUR_DEEPSEEK_API_KEY]
CLAUDE_API_KEY=[YOUR_CLAUDE_API_KEY]
GEMINI_API_KEY=[YOUR_GEMINI_API_KEY]

# JWT Config
JWT_SECRET=[YOUR_JWT_SECRET_MIN_32_CHARS]
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d
```

## Testing Commands

### 1. Test Session Token
```bash
curl -X GET "http://[SERVER_IP]:3000/api/jobs/hierarchy" \
  -H "Authorization: Bearer [YOUR_SESSION_TOKEN]"
```

### 2. Test Cover Letter Generation
```bash
curl -X POST "http://[SERVER_IP]:3000/api/cover_letter" \
  -H "Authorization: Bearer [YOUR_SESSION_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "test_job_1",
    "job_details": "Looking for a Senior Software Engineer with React experience",
    "resume_text": "John Doe\nSoftware Engineer with 5 years React experience",
    "useAi": "deepseek-chat",
    "platform": "seek",
    "job_title": "Senior Software Engineer",
    "company": "Tech Corp"
  }'
```

### 3. Test Bot Cover Letter
```bash
cd /home/wagle/inquisitive_mind/finalboss
rm .cache/jwt_tokens.json  # Force JWT refresh
export API_BASE=http://[SERVER_IP]:3000
bun bot_starter.ts seek
```

## Quick Fix

**Run this now to fix the issue:**

```bash
cd /home/wagle/inquisitive_mind/finalboss
rm .cache/jwt_tokens.json
echo "export API_BASE=http://[SERVER_IP]:3000" >> ~/.bashrc
bun bot_starter.ts seek
```

The bot will:
1. Find no JWT → fall back to session token
2. Convert session token to fresh JWT
3. Use JWT for cover letter API call
4. Cache new JWT for future runs

## Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Corpus-RAG Server | ✅ Running | http://[SERVER_IP]:3000 |
| Session Token | ✅ Valid | [REDACTED] |
| JWT Token | ❌ Expired | Oct 30, 2025 |
| API Connectivity | ✅ Working | Successfully tested |
| Cover Letter Endpoint | ✅ Working | Successfully tested |
| **Fix Required** | Delete expired JWT | `rm .cache/jwt_tokens.json` |

