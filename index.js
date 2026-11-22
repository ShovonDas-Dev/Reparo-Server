import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import crypto from "crypto";
import { verifyToken, requireRole } from "./auth.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL?.replace(/\/$/, ""),
    credentials: true,
  })
);
app.use(express.json());

const port = process.env.PORT || 5000;

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is missing");
}

const client = new MongoClient(
  process.env.MONGODB_URI || "mongodb://localhost:27017"
);
const db = client.db("Reparo");

const servicesCollection = db.collection("ServiceCollection");
const userCollection = db.collection("user");
const bookingsCollection = db.collection("bookings");
const paymentsCollection = db.collection("payments");

// ---------------------------------------------------------------
// DB connection (serverless friendly)
// Connects once, then the same connection is reused.
// ---------------------------------------------------------------
let connecting;
app.use(async (req, res, next) => {
  try {
    connecting ||= client.connect();
    await connecting;
    next();
  } catch (error) {
    connecting = null;
    console.error("MongoDB connection failed:", error);
    res.status(500).send({ message: "Database connection failed" });
  }
});

// ---------------------------------------------------------------
// PUBLIC routes (no token needed)
// ---------------------------------------------------------------

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Filter and get services (only approved and available ones)
app.get("/services", async (req, res) => {
  try {
    const query = {
      approvalStatus: "approved",
      isAvailable: true,
    };

    // 1. Category filter
    if (req.query.category && req.query.category !== "all") {
      const categories = String(req.query.category)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      if (categories.length === 1) {
        query.category = categories[0];
      } else if (categories.length > 1) {
        query.category = { $in: categories };
      }
    }

    // 2. Service mode filter
    if (req.query.serviceMode && req.query.serviceMode !== "all") {
      const modes = String(req.query.serviceMode)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      if (modes.length === 1) {
        query.serviceMode = modes[0];
      } else if (modes.length > 1) {
        query.serviceMode = { $in: modes };
      }
    }

    // 3. Search filter
    if (req.query.search) {
      const search = String(req.query.search).trim();

      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { technicianName: { $regex: search, $options: "i" } },
      ];
    }

    // 4. Category counts
    const countQuery = { ...query };
    delete countQuery.category;

    const categoryCounts = await servicesCollection
      .aggregate([
        { $match: countQuery },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ])
      .toArray();

    // 5. Pagination
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 6, 1), 50);

    // 6. Sorting
    const sortMap = {
      newest: { postedAt: -1, _id: -1 },
      oldest: { postedAt: 1, _id: 1 },
      priceLowToHigh: { basePrice: 1 },
      priceHighToLow: { basePrice: -1 },
    };
    const sort = sortMap[req.query.sort] || sortMap.newest;

    // 7. Total documents
    const total = await servicesCollection.countDocuments(query);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const safePage = Math.min(page, totalPages);

    // 8. Fetch services
    const services = await servicesCollection
      .find(query)
      .sort(sort)
      .skip((safePage - 1) * limit)
      .limit(limit)
      .toArray();

    // 9. Response
    res.send({
      services,
      total,
      page: safePage,
      totalPages,
      categoryCounts: Object.fromEntries(
        categoryCounts
          .filter((item) => item._id)
          .map((item) => [item._id, item.count])
      ),
    });
  } catch (error) {
    console.error("Get services error:", error);
    res.status(500).send({ message: "Failed to fetch services" });
  }
});

// Service details
app.get("/services/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid service ID" });
    }

    const service = await servicesCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!service) {
      return res.status(404).send({ message: "Service not found" });
    }

    res.send(service);
  } catch (error) {
    res.status(500).send({ message: "Something went wrong" });
  }
});

// ---------------------------------------------------------------
// ADMIN routes (token + role "admin")
// ---------------------------------------------------------------

// All users
app.get("/users", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const data = await userCollection.find().toArray();
    res.send(data);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).send({ success: false, message: "Failed to load users" });
  }
});

// Change the role of a user
app.patch(
  "/user/:id/role",
  verifyToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      const allowedRoles = ["customer", "technician", "admin"];
      if (!ObjectId.isValid(id) || !allowedRoles.includes(role)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid user or role" });
      }

      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );

      if (result.matchedCount === 0) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }

      res.send({ success: true, message: "Role updated" });
    } catch (error) {
      console.error("Change role error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to change role" });
    }
  }
);

// All services (pending, approved, rejected)
app.get(
  "/admin/services",
  verifyToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      const services = await servicesCollection
        .find({})
        .sort({ postedAt: -1 })
        .toArray();
      res.send({ success: true, data: services });
    } catch (error) {
      console.error("Admin get services error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to load services" });
    }
  }
);

// Change the approval status of a service
app.patch(
  "/admin/services/:id/approval",
  verifyToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { approvalStatus } = req.body;

      const allowedStatus = ["pending", "approved", "rejected"];
      if (!ObjectId.isValid(id) || !allowedStatus.includes(approvalStatus)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid service or status" });
      }

      const result = await servicesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { approvalStatus } }
      );

      if (result.matchedCount === 0) {
        return res
          .status(404)
          .send({ success: false, message: "Service not found" });
      }

      res.send({ success: true, message: "Approval status updated" });
    } catch (error) {
      console.error("Approval update error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to update service" });
    }
  }
);

// All bookings
app.get(
  "/admin/bookings",
  verifyToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      const bookings = await bookingsCollection
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      res.send({ success: true, data: bookings });
    } catch (error) {
      console.error("Admin get bookings error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to load bookings" });
    }
  }
);

// All payments (transactions) with customer and technician names
app.get(
  "/admin/payments",
  verifyToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      // 1. Load all payments, newest first
      const payments = await paymentsCollection
        .find({})
        .sort({ paidAt: -1 })
        .toArray();

      // 2. Load the bookings that these payments belong to
      const bookingIds = payments
        .filter((payment) => ObjectId.isValid(payment.bookingId))
        .map((payment) => new ObjectId(payment.bookingId));

      const bookings = await bookingsCollection
        .find({ _id: { $in: bookingIds } })
        .toArray();

      // 3. A small lookup: bookingId -> booking
      const bookingMap = {};
      bookings.forEach((booking) => {
        bookingMap[booking._id.toString()] = booking;
      });

      // 4. Add the names to every payment
      const data = payments.map((payment) => {
        const booking = bookingMap[payment.bookingId];
        return {
          ...payment,
          serviceName: payment.serviceName || booking?.serviceName || "-",
          customerName: booking?.customerName || "-",
          customerEmail: booking?.customerEmail || "-",
          technicianName: booking?.technicianName || "-",
          technicianEmail: booking?.technicianEmail || "-",
        };
      });

      res.send({ success: true, data });
    } catch (error) {
      console.error("Admin get payments error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to load payments" });
    }
  }
);

// ---------------------------------------------------------------
// TECHNICIAN routes (token + role "technician")
// ---------------------------------------------------------------

// Add a new service
app.post(
  "/services",
  verifyToken,
  requireRole("technician"),
  async (req, res) => {
    try {
      const data = req.body;

      // The service belongs to the logged in technician (not what the client sends)
      data.technicianEmail = req.user.email;

      // A technician cannot approve his own service
      data.approvalStatus = "pending";
      data.isAvailable = true;

      if (!data.postedAt) {
        data.postedAt = new Date().toISOString();
      }

      const result = await servicesCollection.insertOne(data);

      res.status(201).send({
        success: true,
        message: "Service created successfully",
        insertedId: result.insertedId,
      });
    } catch (error) {
      console.error("Service creation error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to create service" });
    }
  }
);

// My services
app.get(
  "/services/technician/:email",
  verifyToken,
  requireRole("technician"),
  async (req, res) => {
    try {
      // A technician can only see his own services
      if (req.params.email !== req.user.email) {
        return res
          .status(403)
          .send({ success: false, message: "These are not your services" });
      }

      const services = await servicesCollection
        .find({ technicianEmail: req.user.email })
        .sort({ createdAt: -1 })
        .toArray();
      res.send({ success: true, data: services });
    } catch (error) {
      console.error("Get technician services error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to load services" });
    }
  }
);

// Delete my service
app.delete(
  "/services/technician/:id/:email",
  verifyToken,
  requireRole("technician"),
  async (req, res) => {
    try {
      const { id, email } = req.params;

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid service ID" });
      }

      if (email !== req.user.email) {
        return res
          .status(403)
          .send({ success: false, message: "This is not your service" });
      }

      const result = await servicesCollection.deleteOne({
        _id: new ObjectId(id),
        technicianEmail: req.user.email,
      });

      if (result.deletedCount === 0) {
        return res
          .status(404)
          .send({ success: false, message: "Service not found" });
      }

      res.send({ success: true, message: "Service deleted successfully" });
    } catch (error) {
      console.error("Service delete error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to delete service" });
    }
  }
);

// Service on / off
app.patch(
  "/services/technician/:id/availability",
  verifyToken,
  requireRole("technician"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isAvailable } = req.body;

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid service ID" });
      }

      if (typeof isAvailable !== "boolean") {
        return res.status(400).send({
          success: false,
          message: "isAvailable must be true or false",
        });
      }

      // Only the owner of the service can change it
      const result = await servicesCollection.updateOne(
        { _id: new ObjectId(id), technicianEmail: req.user.email },
        { $set: { isAvailable } }
      );

      if (result.matchedCount === 0) {
        return res
          .status(404)
          .send({ success: false, message: "Service not found" });
      }

      res.send({ success: true, message: "Service updated" });
    } catch (error) {
      console.error("Update availability error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to update service" });
    }
  }
);

// My bookings (as a technician)
app.get(
  "/bookings/technician/:email",
  verifyToken,
  requireRole("technician"),
  async (req, res) => {
    try {
      if (req.params.email !== req.user.email) {
        return res
          .status(403)
          .send({ success: false, message: "These are not your bookings" });
      }

      const bookings = await bookingsCollection
        .find({ technicianEmail: req.user.email })
        .sort({ createdAt: -1 })
        .toArray();
      res.send({ success: true, data: bookings });
    } catch (error) {
      console.error("Get technician bookings error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to load bookings" });
    }
  }
);

// Update the booking status (only in the right order)
app.patch(
  "/bookings/:id/status",
  verifyToken,
  requireRole("technician"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid booking ID" });
      }

      const allowedNext = {
        pending: ["confirmed"],
        confirmed: ["in_progress"],
        in_progress: ["completed"],
      };

      const booking = await bookingsCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!booking) {
        return res
          .status(404)
          .send({ success: false, message: "Booking not found" });
      }

      // Only the technician of this booking can change its status
      if (booking.technicianEmail !== req.user.email) {
        return res
          .status(403)
          .send({ success: false, message: "This is not your booking" });
      }

      if (!allowedNext[booking.status]?.includes(status)) {
        return res.status(400).send({
          success: false,
          message: `Cannot change status from ${booking.status} to ${status}`,
        });
      }

      await bookingsCollection.updateOne(
        { _id: booking._id },
        { $set: { status, updatedAt: new Date() } }
      );
      res.send({ success: true, message: "Status updated" });
    } catch (error) {
      console.error("Update status error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to update status" });
    }
  }
);

// Money I earned (as a technician)
app.get(
  "/payments/technician/:technicianId",
  verifyToken,
  requireRole("technician"),
  async (req, res) => {
    try {
      if (req.params.technicianId !== req.user.id) {
        return res
          .status(403)
          .send({ success: false, message: "These are not your payments" });
      }

      const payments = await paymentsCollection
        .find({ technicianId: req.user.id })
        .sort({ paidAt: -1 })
        .toArray();
      res.send({ success: true, data: payments });
    } catch (error) {
      console.error("Get technician payments error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to load payments" });
    }
  }
);

// ---------------------------------------------------------------
// CUSTOMER routes (token + role "customer")
// ---------------------------------------------------------------

// Create a booking
app.post(
  "/bookings",
  verifyToken,
  requireRole("customer"),
  async (req, res) => {
    try {
      const { serviceId } = req.body;

      // The customer is the logged in user (not what the client sends)
      const customerId = req.user.id;

      // 1. Validate required fields
      if (!serviceId) {
        return res
          .status(400)
          .send({ success: false, message: "Service ID is required" });
      }

      // 2. Validate MongoDB ObjectIds
      if (!ObjectId.isValid(serviceId) || !ObjectId.isValid(customerId)) {
        return res.status(400).send({
          success: false,
          message: "Invalid Service ID or Customer ID",
        });
      }

      // 3. Find the customer
      const customer = await userCollection.findOne({
        _id: new ObjectId(customerId),
        role: "customer",
      });
      if (!customer) {
        return res
          .status(404)
          .send({ success: false, message: "Customer not found" });
      }

      // 4. Find an approved and available service
      const service = await servicesCollection.findOne({
        _id: new ObjectId(serviceId),
        approvalStatus: "approved",
        isAvailable: true,
      });
      if (!service) {
        return res.status(404).send({
          success: false,
          message: "Service not found or not available for booking",
        });
      }

      // 5. Find the technician
      const technician = await userCollection.findOne({
        email: service.technicianEmail,
        role: "technician",
      });
      if (!technician) {
        return res
          .status(404)
          .send({ success: false, message: "Technician not found" });
      }

      // 6. Create the booking document (the price comes from the service)
      const bookingData = {
        customerId: customer._id.toString(),
        customerName: customer.name,
        customerEmail: customer.email,

        serviceId: service._id.toString(),
        serviceName: service.title,
        category: service.category,
        description: service.description,
        image: service.image,
        amount: Number(service.basePrice),
        estimatedDuration: service.estimatedDuration,
        serviceMode: service.serviceMode,
        serviceArea: service.serviceArea,

        technicianId: technician._id.toString(),
        technicianName: technician.name,
        technicianEmail: technician.email,

        status: "pending",
        paymentStatus: "unpaid",

        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 7. Save the booking
      const result = await bookingsCollection.insertOne(bookingData);

      res.status(201).send({
        success: true,
        message: "Booking created successfully",
        bookingId: result.insertedId,
      });
    } catch (error) {
      console.error("Create booking error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to create booking" });
    }
  }
);

// My bookings (as a customer)
app.get(
  "/bookings/customer/:customerId",
  verifyToken,
  requireRole("customer"),
  async (req, res) => {
    try {
      const { customerId } = req.params;

      // A customer can only see his own bookings
      if (customerId !== req.user.id) {
        return res
          .status(403)
          .send({ success: false, message: "These are not your bookings" });
      }

      const bookings = await bookingsCollection
        .find({ customerId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray();

      res.send({ success: true, data: bookings });
    } catch (error) {
      console.error("Get bookings error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to load bookings" });
    }
  }
);

// Cancel my booking (only while it is pending)
app.patch(
  "/bookings/:id/cancel",
  verifyToken,
  requireRole("customer"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid booking ID" });
      }

      // The booking must belong to the logged in customer
      const result = await bookingsCollection.updateOne(
        { _id: new ObjectId(id), customerId: req.user.id, status: "pending" },
        { $set: { status: "cancelled", updatedAt: new Date() } }
      );

      if (result.matchedCount === 0) {
        return res.status(400).send({
          success: false,
          message: "Only your requested bookings can be cancelled",
        });
      }

      res.send({ success: true, message: "Booking cancelled" });
    } catch (error) {
      console.error("Cancel booking error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to cancel booking" });
    }
  }
);

// Payment (simulated): booking paid + payments record
app.patch(
  "/bookings/:id/pay",
  verifyToken,
  requireRole("customer"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid booking ID" });
      }

      const booking = await bookingsCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!booking) {
        return res
          .status(404)
          .send({ success: false, message: "Booking not found" });
      }

      // Only the owner can pay (the id comes from the token)
      if (booking.customerId !== req.user.id) {
        return res
          .status(403)
          .send({ success: false, message: "You do not own this booking" });
      }

      // Already has a payment record: safe to return success again
      const existing = await paymentsCollection.findOne({
        bookingId: booking._id.toString(),
      });
      if (existing) {
        return res.send({
          success: true,
          message: "Already paid",
          payment: existing,
        });
      }

      // Change unpaid -> paid only once
      const result = await bookingsCollection.updateOne(
        { _id: booking._id, status: "completed", paymentStatus: "unpaid" },
        {
          $set: {
            paymentStatus: "paid",
            paidAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        let message = "Payment not allowed";
        if (booking.paymentStatus === "paid") {
          message = "Booking is already marked paid";
        } else if (booking.status !== "completed") {
          message = `Booking status is "${booking.status}", it must be "completed"`;
        }
        return res.status(400).send({ success: false, message });
      }

      // Save the payment record (amount comes from the booking, not the client)
      const payment = {
        bookingId: booking._id.toString(),
        customerId: booking.customerId,
        technicianId: booking.technicianId,
        serviceName: booking.serviceName,
        amount: booking.amount,
        currency: "BDT",
        method: "card",
        status: "paid",
        transactionId: "sim_cs_test_" + crypto.randomBytes(8).toString("hex"),
        paidAt: new Date(),
        createdAt: new Date(),
      };
      await paymentsCollection.insertOne(payment);

      res.send({ success: true, message: "Payment successful", payment });
    } catch (error) {
      console.error("Pay error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to pay for the booking" });
    }
  }
);

// My payments (as a customer)
app.get(
  "/payments",
  verifyToken,
  requireRole("customer"),
  async (req, res) => {
    try {
      // Always the logged in customer, whatever the query says
      const payments = await paymentsCollection
        .find({ customerId: req.user.id })
        .sort({ paidAt: -1 })
        .toArray();
      res.send({ success: true, data: payments });
    } catch (error) {
      console.error("Get payments error:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to load payments" });
    }
  }
);

// ---------------------------------------------------------------
// PROFILE routes (token needed, any role: customer, technician, admin)
// Everyone can only see and change HIS OWN profile.
// ---------------------------------------------------------------

// Get my profile
app.get("/profile", verifyToken, async (req, res) => {
  try {
    // The email comes from the token (any email in the query is ignored)
    const user = await userCollection.findOne(
      { email: req.user.email },
      { projection: { password: 0 } } // never send the password
    );

    if (!user) {
      return res
        .status(404)
        .send({ success: false, message: "User not found" });
    }

    res.send({ success: true, data: user });
  } catch (error) {
    console.error("Get profile error:", error);
    res
      .status(500)
      .send({ success: false, message: "Failed to load profile" });
  }
});

// Update my profile (name, phone, address, image)
app.patch("/profile", verifyToken, async (req, res) => {
  try {
    const { name, phone, address, image } = req.body;

    // Only these fields can be changed. email, role and password cannot.
    const updates = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (phone !== undefined) updates.phone = String(phone).trim();
    if (address !== undefined) updates.address = String(address).trim();
    if (image !== undefined) updates.image = String(image).trim();
    updates.updatedAt = new Date();

    // The email comes from the token (any email in the body is ignored)
    const result = await userCollection.updateOne(
      { email: req.user.email },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .send({ success: false, message: "User not found" });
    }

    res.send({ success: true, message: "Profile updated" });
  } catch (error) {
    console.error("Update profile error:", error);
    res
      .status(500)
      .send({ success: false, message: "Failed to update profile" });
  }
});

// ---------------------------------------------------------------
// Start the server
// Local e listen kore. Vercel e listen hoy na (Vercel nijei handle kore).
// ---------------------------------------------------------------
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

export default app;