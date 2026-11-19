
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
  const servicesCollection = db.collection("ServiceCollection")

  console.log(client)

  app.use(express.json());


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
    const query = {};

    console.log("Service query:", req.query);

    // 1. Category Filter
    if (req.query.category && req.query.category !== "all") {
      const categories = String(req.query.category)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
        console.log("categoris " + categories)

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
    // Category filter বাদ দিয়ে count calculate হবে
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


  app.delete('/jobs/:id' , async (req,res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.deleteOne(query)
      res.send(result)
  })

  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });