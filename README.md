# FinalBoss - Job Application Automation Platform

AI-powered job application automation platform that integrates with job boards (LinkedIn, Indeed, Seek) and generates personalized cover letters, resumes, and answers using the corpus-rag API.

---

## 🌿 Git Branches

**Branch Strategy:**
- **`develop`** - Development branch (for active development and testing)
- **`alpha`** - Production branch (stable, deployed to production)

**Usage:**
- For development work, use: `git checkout develop`
- For production deployment, use: `git checkout alpha`
- Always merge `develop` → `alpha` when ready for production

---

## 🚀 Quick Start

> **📌 Branch Information:** This project uses `develop` for development and `alpha` for production. See [Git Branches](#-git-branches) section for details.

### Prerequisites
- Node.js (v18 or higher)
- npm or bun
- MongoDB (for corpus-rag API integration)
- Chrome/Chromium browser (for bot automation)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd finalboss
   ```

2. **Checkout the appropriate branch:**
   ```bash
   git checkout develop  # For development
   # or
   git checkout alpha    # For production
   ```

3. **Install dependencies:**
   ```bash
   npm install
   # or
   bun install
   ```

4. **Configure environment variables:**
   Create a `.env` file in the root directory:
   ```bash
   # API Configuration
   PUBLIC_API_BASE=http://localhost:3000
   VITE_API_BASE=http://localhost:3000

   # Add other required environment variables
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   # or
   npm run dev:plain
   ```

6. **Access the application:**
   - Web: `http://localhost:5173` (or the port shown in terminal)
   - Tauri Desktop App: `npm run tauri:dev`

---

## 📋 Overview

FinalBoss is a comprehensive job application automation platform with the following features:

### Core Features
- **Job Board Integration**: Automated job searching and application on LinkedIn, Indeed, and Seek
- **AI-Powered Content Generation**: 
  - Personalized cover letters
  - Tailored resume enhancement
  - Intelligent question answering
- **API Testing Interface**: Built-in API testing tools for corpus-rag integration
- **Desktop Application**: Tauri-based desktop app for cross-platform support

### Components

1. **Web Interface** (SvelteKit)
   - User dashboard
   - Bot selection and configuration
   - API testing interface
   - Cover letter and resume generation pages

2. **Bot Automation System**
   - LinkedIn bot
   - Indeed bot
   - Seek bot
   - Workflow-based automation engine

3. **API Integration**
   - Corpus-rag API client
   - Authentication handling
   - Job application processing

---

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run dev              # Start dev server with environment variables
npm run dev:plain        # Start dev server without env loading

# Building
npm run build            # Build for production
npm run preview          # Preview production build

# Tauri (Desktop App)
npm run tauri            # Tauri CLI commands
npm run tauri:dev        # Run Tauri dev mode

# Testing
npm run test             # Run tests
npm run test:run         # Run tests once
npm run test:watch       # Run tests in watch mode

# Type Checking
npm run check            # Type check Svelte components
npm run check:watch      # Type check in watch mode
```

### Project Structure

```
finalboss/
├── src/
│   ├── routes/          # SvelteKit routes
│   │   ├── api/         # API endpoints
│   │   ├── api-test/    # API testing interface
│   │   ├── cover-letters/
│   │   ├── resume-enhancement/
│   │   └── ...
│   ├── bots/            # Bot implementations
│   │   ├── linkedin/
│   │   ├── indeed/
│   │   └── seek/
│   ├── lib/             # Shared libraries
│   │   ├── corpus-rag-client.js
│   │   ├── corpus-rag-auth.js
│   │   └── job-application-handler.js
│   └── ...
├── src-tauri/           # Tauri desktop app code
├── static/              # Static assets
└── package.json
```

---

## 🔗 Integration with Corpus-Rag API

FinalBoss integrates with the corpus-rag API for AI-powered content generation. Ensure the corpus-rag API is running and accessible.

### Authentication Flow

1. User logs in through finalboss
2. Session token is stored in localStorage
3. Session token is converted to JWT for API calls
4. JWT is used for authenticated API requests

### API Endpoints Used

- `/api/auth/session-to-jwt` - Convert session token to JWT
- `/api/cover_letter` - Generate cover letters
- `/api/resume` - Enhance resumes
- `/api/question_answers` - Answer employer questions
- `/api/jobs` - Manage job listings

---

## 🧪 Testing

### API Testing

The application includes a built-in API testing interface at `/api-test` that allows you to:
- Test cover letter generation
- Test resume enhancement
- Test question answering
- View authentication status
- Debug API responses

### Running Tests

```bash
npm run test
```

---

## 📦 Building for Production

### Web Build

```bash
npm run build
npm run preview  # Test production build locally
```

### Tauri Desktop Build

```bash
npm run tauri build
```

---

## 🔧 Configuration

### Environment Variables

Key environment variables:

- `PUBLIC_API_BASE` - Base URL for corpus-rag API
- `VITE_API_BASE` - Alternative API base URL

### Bot Configuration

Bot configurations are stored in:
- `src/bots/{bot-name}/{bot-name}_steps.yaml` - Workflow steps
- `src/bots/{bot-name}/{bot-name}_selectors.json` - DOM selectors

---

## 🐛 Troubleshooting

### Common Issues

1. **API Connection Errors**
   - Ensure corpus-rag API is running
   - Check `PUBLIC_API_BASE` environment variable
   - Verify network connectivity

2. **Authentication Issues**
   - Clear localStorage and sessionStorage
   - Re-login to get fresh tokens
   - Check token expiration

3. **Bot Automation Failures**
   - Ensure Chrome/Chromium is installed
   - Check browser driver compatibility
   - Verify selectors in bot configuration files

---

## 📝 Contributing

1. **Checkout the development branch:**
   ```bash
   git checkout develop
   git pull origin develop
   ```

2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes and test thoroughly**

4. **Commit and push:**
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin feature/your-feature-name
   ```

5. **Create a pull request to `develop`**

6. **After review and testing, merge to `alpha` for production**

---

## 📄 License

MIT

---

## 🤝 Support

For issues, feature requests, or questions, please open an issue on GitHub.

---

## 🔄 Deployment

### Development Deployment
- Deploy from `develop` branch
- Use for staging/testing environments

### Production Deployment
- Deploy from `alpha` branch
- Ensure all tests pass
- Review changelog before deployment

```bash
# Before production deployment
git checkout alpha
git pull origin alpha
npm run build
npm run test:run
```
