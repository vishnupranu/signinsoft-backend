
web
npm run dev

# Server Configuration
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Database Configuration (Updated with cPanel MySQL details)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=signinsoft_main
DB_USER=signinsoft_user
DB_PASSWORD=SignInSoft2024!DB

# Email Configuration (Update with your email service)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_FROM=noreply@yourdomain.com

# File Upload Configuration
UPLOAD_MAX_SIZE=50MB
UPLOAD_ALLOWED_TYPES=jpg,jpeg,png,gif,pdf,doc,docx,xls,xlsx,ppt,pptx,txt,zip,rar


# Security
BCRYPT_ROUNDS=12
PASSWORD_RESET_EXPIRES=3600000
EMAIL_VERIFICATION_EXPIRES=86400000

# Logging
LOG_LEVEL=info
LOG_FILE=true

# Cache Configuration
CACHE_TTL=3600

# Third-party Services (Update with your API keys)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_s3_bucket_name
