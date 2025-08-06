# Cold Email Platform

A modern cold email outreach platform built with Next.js, similar to Instantly AI. This platform allows users to send personalized cold emails at scale, track engagement, and manage campaigns effectively.

## Features

### ✅ Completed Features
- **User Authentication System**: Registration, login, and session management
- **Database Integration**: MongoDB with Mongoose for data persistence
- **Responsive UI**: Modern interface built with Tailwind CSS and Radix UI components
- **Dashboard**: Basic dashboard showing user stats and platform status
- **Database Models**: Complete schema for users, email accounts, contacts, campaigns, and email logs

### 🚧 In Development
- Email account management (SMTP/IMAP integration)
- Campaign builder with email sequences
- Contact list management and CSV import
- Email sending engine with rate limiting
- Analytics dashboard with open/click tracking
- Inbox management for replies

### ⏳ Planned Features
- Email warm-up functionality
- Spam prevention and deliverability optimization
- Advanced analytics and reporting
- A/B testing for email campaigns
- API integrations (CRM, webhooks)
- Team collaboration features

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS, Radix UI components
- **Backend**: Next.js API routes
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT tokens, bcrypt for password hashing
- **Form Management**: React Hook Form with Zod validation
- **Email**: Nodemailer (planned), IMAP integration (planned)

## Getting Started

### Prerequisites
- Node.js 18+ 
- MongoDB (local or cloud instance)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd cold-email-platform
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory with:
```
MONGODB_URI=mongodb://localhost:27017/cold-email-platform
NEXTAUTH_SECRET=your-nextauth-secret-key-here
NEXTAUTH_URL=http://localhost:3000
JWT_SECRET=your-jwt-secret-key-here
```

4. Start MongoDB (if running locally):
```bash
mongod
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Schema

### User Model
- Authentication and profile information
- Plan management and usage limits
- Email sending quotas

### EmailAccount Model
- SMTP/IMAP configuration
- Email provider settings
- Daily sending limits and reputation tracking

### Contact Model
- Contact information and custom fields
- Status tracking (active, unsubscribed, bounced)
- Tagging and list management

### Campaign Model
- Email sequences and automation
- Scheduling and delivery settings
- Campaign statistics and tracking

### EmailLog Model
- Detailed email sending logs
- Open/click tracking
- Delivery status and analytics

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Planned Endpoints
- `/api/email-accounts` - Manage email accounts
- `/api/contacts` - Contact management
- `/api/campaigns` - Campaign CRUD operations
- `/api/analytics` - Performance analytics
- `/api/send` - Email sending engine

## Project Structure

```
src/
├── app/                    # Next.js app router
│   ├── api/               # API routes
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Dashboard pages
│   └── globals.css        # Global styles
├── components/            # Reusable components
│   └── ui/               # UI component library
├── lib/                  # Utility functions
│   ├── auth.ts           # Authentication utilities
│   ├── mongodb.ts        # Database connection
│   └── utils.ts          # General utilities
└── models/               # MongoDB/Mongoose models
    ├── User.ts
    ├── EmailAccount.ts
    ├── Contact.ts
    ├── Campaign.ts
    └── EmailLog.ts
```

## Development Roadmap

### Phase 1: Core Infrastructure ✅
- [x] Project setup and configuration
- [x] Database design and models
- [x] User authentication system
- [x] Basic UI components and pages

### Phase 2: Email Management 🚧
- [ ] Email account setup and validation
- [ ] SMTP/IMAP configuration
- [ ] Email template system
- [ ] Contact import/export

### Phase 3: Campaign System
- [ ] Campaign builder interface
- [ ] Email sequence designer
- [ ] Scheduling and automation
- [ ] A/B testing framework

### Phase 4: Analytics & Monitoring
- [ ] Email tracking (opens, clicks)
- [ ] Analytics dashboard
- [ ] Performance metrics
- [ ] Deliverability monitoring

### Phase 5: Advanced Features
- [ ] Email warm-up system
- [ ] Spam prevention
- [ ] API integrations
- [ ] Team collaboration

## Contributing

This project is currently in active development. Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is for educational and development purposes. Please ensure compliance with email marketing laws and regulations (CAN-SPAM, GDPR, etc.) when using this platform.

## Support

For questions or support, please open an issue in the repository or contact the development team.

---

**Note**: This platform is currently under development and should not be used for production email campaigns until all features are complete and thoroughly tested.
