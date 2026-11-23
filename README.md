
<div align="center">

# 🔧 Reparo Server

### Powerful REST API for the Reparo Repair Service Platform

**Live API:** https://reparo-server-3bep.vercel.app/

**Client Application:** https://reparo-client.vercel.app/

</div>

---

## 📌 Overview

**Reparo Server** is the backend API of the Reparo repair-service platform. It is built with Node.js and Express.js to manage application data, authentication verification, user roles, repair services, bookings, payments, and profile management.

The backend communicates with the Next.js frontend and uses MongoDB to store and manage application data.

It provides secure API access for three types of users:

- **Admin** – Manages users, services, bookings, and payments.
- **Technician** – Manages repair services, bookings, and earnings.
- **Customer** – Explores services, manages bookings, and accesses payment information.

## ✨ Key Features

- ⚙️ RESTful API built with Express.js.
- 🔐 JWT verification using JOSE.
- 🛡️ Role-based authorization middleware.
- 👥 Admin, Technician, and Customer access control.
- 🛠️ Repair service management.
- 📅 Booking management.
- 💳 Payment information management.
- 👤 User profile management.
- 🔍 Service search and category filtering.
- 📄 Pagination and sorting.
- 🗄️ MongoDB database integration.
- 🌐 CORS configuration for frontend communication.
- 🚀 Serverless deployment support with Vercel.

## 🛠️ Technology Stack

### Backend

| Technology | Purpose |
|---|---|
| Node.js | JavaScript Runtime |
| Express.js 5 | REST API Framework |
| MongoDB 7 | NoSQL Database |
| JOSE | JWT Verification |
| dotenv | Environment Variables |
| CORS | Cross-Origin Resource Sharing |
| crypto | Cryptographic Utilities |

### Deployment & Tools

| Technology | Purpose |
|---|---|
| Vercel | Backend Deployment |
| Git | Version Control |
| GitHub | Source Code Management |

## 🔐 Authentication & Authorization

Reparo Server uses JWT-based authentication with the **JOSE** library.

The authentication middleware verifies incoming Bearer tokens using the JSON Web Key Set (JWKS) endpoint provided by the frontend authentication system.

### Authentication Process

1. User signs in through the frontend.
2. The frontend authentication system provides a JWT.
3. The frontend sends the token with API requests.
4. The backend verifies the token signature using JWKS.
5. The backend extracts user information and role.
6. Role-based middleware checks access permissions.
7. Authorized requests continue to the API routes.

### Supported Roles

- Admin
- Technician
- Customer

## 📡 API Overview

### Public Routes

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Server status |
| GET | `/services` | Get available services |
| GET | `/services/:id` | Get service details |

### Admin Routes

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users` | Get all users |
| PATCH | `/user/:id/role` | Update user role |
| GET | `/admin/services` | Get all services |
| PATCH | `/admin/services/:id/approval` | Update service approval |
| GET | `/admin/bookings` | Get all bookings |
| GET | `/admin/payments` | Get all payments |

### Technician Routes

| Method | Endpoint | Description |
|---|---|---|
| POST | `/services` | Create a service |
| GET | `/services/technician/:email` | Get technician services |
| DELETE | `/services/technician/:id/:email` | Delete a service |
| GET | `/bookings/technician/:email` | Get technician bookings |
| PATCH | `/bookings/:id/status` | Update booking status |

### Customer Routes

| Method | Endpoint | Description |
|---|---|---|
| GET | `/bookings/customer/:customerId` | Get customer bookings |
| GET | `/payments` | Get customer payments |

### Profile Routes

| Method | Endpoint | Description |
|---|---|---|
| GET | `/profile` | Get logged-in user profile |
| PATCH | `/profile` | Update user profile |

*Note: Protected routes require a valid Bearer token and the appropriate user role. This is a selected API overview.*

## 🗄️ Database Structure

Reparo uses MongoDB as its primary database.

**Database Name:** `Reparo`

### Collections

| Collection | Description |
|---|---|
| `ServiceCollection` | Stores repair service information |
| `user` | Stores user information and roles |
| `bookings` | Stores repair booking information |
| `payments` | Stores payment records |

## 🚀 Getting Started

Follow these instructions to run the backend locally.

### Prerequisites

Make sure you have installed:

- Node.js
- npm
- MongoDB access
- Git

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/ShovonDas-Dev/Reparo-Server.git
```

**2. Navigate to the project directory**

```bash
cd Reparo-Server
```

**3. Install dependencies**

```bash
npm install
```

**4. Configure environment variables**

Create a `.env` file in the root directory.

```env
PORT=5000

MONGODB_URI=your_mongodb_connection_string

FRONTEND_URL=http://localhost:3000

AUTH_URL=http://localhost:3000
```

Replace the example values with your actual configuration.

**5. Start the development server**

```bash
npm run dev
```

The backend will run at:

```text
http://localhost:5000
```

### Production

To start the server in production mode:

```bash
npm start
```

## 📁 Project Structure

```text
Reparo-Server/
│
├── auth.js
│
├── index.js
│
├── package.json
│
├── package-lock.json
│
├── vercel.json
│
└── .gitignore
```

## 🌐 Deployment

The Reparo backend is deployed on Vercel.

**Live API:**

https://reparo-server-3bep.vercel.app/

**Frontend Application:**

https://reparo-client.vercel.app/

## 🔒 Security

- JWT signature verification using JWKS.
- Role-based authorization.
- Protected API endpoints.
- User-specific data access restrictions.
- CORS configuration.
- Environment variables for sensitive credentials.
- MongoDB ObjectId validation.

Never expose database credentials, authentication secrets, or private configuration values in public repositories.

## 🤝 Contributing

Contributions, suggestions, and improvements are welcome.

1. Fork the repository.
2. Create a new branch.
3. Make your changes.
4. Commit your changes.
5. Submit a pull request.

## 📄 License

This project currently uses the ISC license specified in its package.json.

---

<div align="center">

### 🔧 Reparo — Good Repairs. Good People.

**Building Reliable Backend Services for Better Repair Experiences.**

Made with ❤️ by Shovon Das

[Live API](https://reparo-server-3bep.vercel.app/) · [Frontend](https://reparo-client.vercel.app/) · [GitHub Repository](https://github.com/ShovonDas-Dev/Reparo-Server)

</div>
