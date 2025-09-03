# SigninSoft Project

A full-stack web and mobile application built with React Router, Vite, and React Native.

## 🚀 Project Structure

```
signinsoft-project/
├── apps/
│   ├── web/          # React Router web application
│   └── mobile/       # React Native mobile application
└── README.md
```

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Git

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/pavanichinni21f/signinsoft-project.git
   cd signinsoft-project
   ```

2. **Install dependencies for web app**
   ```bash
   cd apps/web
   npm install
   ```

3. **Install dependencies for mobile app**
   ```bash
   cd ../mobile
   npm install
   ```

## ⚙️ Configuration

### Web Application

1. **Environment Variables**
   Create a `.env` file in `apps/web/` with:
   ```env
   # Authentication Configuration
   AUTH_SECRET=your-auth-secret-key-here
   AUTH_URL=https://your-domain.com
   
   # Database Configuration
   DATABASE_URL=your-database-connection-string
   
   # Public Environment Variables
   NEXT_PUBLIC_CREATE_ENV=PRODUCTION
   NEXT_PUBLIC_PROJECT_GROUP_ID=your-project-group-id
   NEXT_PUBLIC_CREATE_BASE_URL=https://www.create.xyz
   NEXT_PUBLIC_CREATE_HOST=your-domain.com
   
   # CORS Configuration
   CORS_ORIGINS=https://your-domain.com
   ```

## 🚀 Development

### Web Application

```bash
cd apps/web
npm run dev
```

The web app will be available at `http://localhost:4000`

### Mobile Application

```bash
cd apps/mobile
npm start
```

## 🏗️ Building for Production

### Web Application

```bash
cd apps/web
npm run build
```

### Mobile Application

```bash
cd apps/mobile
npm run build
```

## 📦 Deployment

### Quick Deployment

1. **Build the project**
   ```bash
   cd apps/web
   npm run build
   ```

2. **Create deployment package**
   ```bash
   cd ../../
   zip -r signinsoft-project-deploy.zip . -x '*.git*' 'node_modules/*' '*/node_modules/*' 'build/*' '*/build/*' 'dist/*' '*/dist/*' '.DS_Store' '*.log'
   ```

3. **Deploy to your hosting platform**
   - Upload the zip file to your hosting service
   - Extract and run `npm install` in the web directory
   - Configure environment variables
   - Start the application

### Git Deployment

The project is configured for automatic deployment. Simply push to the main branch:

```bash
git add .
git commit -m "Deploy updates"
git push origin main
```

## 🛠️ Technologies Used

### Web Application
- **Framework**: React Router v7
- **Build Tool**: Vite
- **Styling**: Tailwind CSS, Chakra UI
- **Authentication**: Auth.js with Hono
- **Database**: Neon (PostgreSQL)
- **Language**: TypeScript

### Mobile Application
- **Framework**: React Native with Expo
- **Language**: TypeScript
- **Navigation**: Expo Router

## 📁 Key Features

- 🔐 Authentication system
- 📱 Responsive web design
- 📲 Cross-platform mobile app
- 🗄️ Database integration
- 🎨 Modern UI components
- 🚀 Production-ready build system

## 🔧 Scripts

### Web App Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run typecheck` - Run TypeScript type checking

### Mobile App Scripts
- `npm start` - Start Expo development server
- `npm run build` - Build for production

## 🐛 Troubleshooting

### Common Issues

1. **Module not found errors**
   - Ensure all dependencies are installed: `npm install`
   - Check import paths and file extensions

2. **Build failures**
   - Clear node_modules and reinstall: `rm -rf node_modules && npm install`
   - Check environment variables are properly set

3. **Authentication issues**
   - Verify AUTH_SECRET and AUTH_URL in .env file
   - Check database connection string

## 📄 License

This project is private and proprietary.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For support and questions, please contact the development team.

---

**Last Updated**: August 2024
**Version**: 1.0.0