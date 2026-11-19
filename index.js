
  import express from 'express';
  import cors from 'cors';
  import { MongoClient, ObjectId } from 'mongodb';
  import dotenv from 'dotenv';

  dotenv.config();

  const app = express()


  app.use(cors())
  app.use(express.json())

  const port = 5000;

  const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db("Reparo");

const servicesCollection = db.collection("ServiceCollection");
const userCollection = db.collection("user");
const bookingsCollection = db.collection("bookings");

  console.log(client)

 


  app.get('/', (req, res) => {
    res.send('Hello World!');
  });

  app.get("/user" , async (req, res) => {
    
      const collection = db.collection("user");
      const data = await collection.find().toArray();
      res.send(data)
      
  })

  // post api service add api

  app.post("/services", async (req, res) => {
    try {
      const data = req.body

      if (!data.postedAt) {
        data.postedAt = new Date().toISOString()
      }

      const result = await servicesCollection.insertOne(data)

      res.status(201).send({
        success: true,
        message: "Service created successfully",
        insertedId: result.insertedId,
      })
    } catch (error) {
      console.error("Service creation error:", error)

      res.status(500).send({
        success: false,
        message: "Failed to create ",
      })
    }
  })

// filter and get api
  

app.get("/services", async (req, res) => {
  try {
    // Only approved and available services
    const query = {
      approvalStatus: "approved",
      isAvailable: true,
    };

    console.log("Service query:", req.query);

    // 1. Category Filter
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

    // 2. Service Mode Filter
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

    // 3. Search Filter
    if (req.query.search) {
      const search = String(req.query.search).trim();

      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { technicianName: { $regex: search, $options: "i" } },
      ];
    }

    // 4. Category Counts
    const countQuery = { ...query };
    delete countQuery.category;

    const categoryCounts = await servicesCollection
      .aggregate([
        { $match: countQuery },
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    // 5. Pagination
    const page = Math.max(parseInt(req.query.page) || 1, 1);

    const limit = Math.min(
      Math.max(parseInt(req.query.limit) || 6, 1),
      50
    );

    // 6. Sorting
    const sortMap = {
      newest: { postedAt: -1, _id: -1 },
      oldest: { postedAt: 1, _id: 1 },
      priceLowToHigh: { basePrice: 1 },
      priceHighToLow: { basePrice: -1 },
    };

    const sort = sortMap[req.query.sort] || sortMap.newest;

    // 7. Total Documents
    const total = await servicesCollection.countDocuments(query);

    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const safePage = Math.min(page, totalPages);

    // 8. Fetch Services
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

    res.status(500).send({
      message: "Failed to fetch services",
      error: error.message,
    });
  }
});


// service detais api
app.get("/services/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const service = await servicesCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!service) {
      return res.status(404).send({
        message: "Service not found",
      });
    }

    res.send(service);

  } catch (error) {
    res.status(500).send({
      message: "Something went wrong",
    });
  }
});

// Booking Api

// Create Booking API
app.post("/bookings", async (req, res) => {
  try {
    const { serviceId, customerId } = req.body;

    // 1. Validate required fields
    if (!serviceId || !customerId) {
      return res.status(400).send({
        success: false,
        message: "Service ID and Customer ID are required",
      });
    }

    // 2. Validate MongoDB ObjectIds
    if (
      !ObjectId.isValid(serviceId) ||
      !ObjectId.isValid(customerId)
    ) {
      return res.status(400).send({
        success: false,
        message: "Invalid Service ID or Customer ID",
      });
    }

    // 3. Find Customer
    const customer = await userCollection.findOne({
      _id: new ObjectId(customerId),
      role: "customer",
    });

  
    if (!customer) {
      return res.status(404).send({
        success: false,
        message: "Customer not found",
      });
    }

    // 4. Find Approved and Available Service
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

    // 5. Find Technician
    const technician = await userCollection.findOne({
      email: service.technicianEmail,
      role: "technician",
    });

    if (!technician) {
      return res.status(404).send({
        success: false,
        message: "Technician not found",
      });
    }

    // 6. Create Booking Document
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

    // 7. Save Booking
    const result = await bookingsCollection.insertOne(bookingData);

    res.status(201).send({
      success: true,
      message: "Booking created successfully",
      bookingId: result.insertedId,
    });

  } catch (error) {
    console.error("Create booking error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to create booking",
    });
  }
});


const startServer = async () => {
  try {
    await client.connect();

    console.log("MongoDB Connected Successfully");

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

  } catch (error) {
    console.error("MongoDB connection failed:", error);
  }
};

startServer();


git add .

  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });