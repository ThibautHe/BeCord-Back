const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cookieParser = require("cookie-parser");

const userSchema = require("../models/UserSchema");
const messageSchema = require("../models/MessageSchema");
const lobbySchema = require("../models/LobbySchema");
const verifyToken = require("./verifyJwt");
const { connectToDb } = require("./db");
const API_URL = "http://localhost:3000";
const API_FETCH = "http://localhost:5173";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: API_FETCH,
    credentials: true,
    methods: "GET, POST, PUT, DELETE",
    allowedHeaders: "Content-Type, Authorization",
  })
); // Enable CORS

// Initialize server and socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:5173"], // ✅ Autorise les deux ports
    methods: ["GET", "POST"],
  },
});

app.use(express.json());
app.use(cookieParser()); // Enable cookie parsing

connectToDb(() => {
  server.listen(3000, () => {
    console.log("app is listening on port " + 3000);
  });
});

// WebSocket connection and events handling
io.on('connection', (socket) => {
  console.log('A user is connected: ' + socket.id);

  // Handle joining a channel (lobby)
  socket.on('join_channel', async (channelId) => {
    const user = await userSchema.findById(ObjectId(socket.id));
    if (user) {
      socket.join(channelId);
      console.log(`User ${socket.id} joined channel ${channelId}`);
    }
  });

  // Handle leaving a channel (lobby)
  socket.on('leave_channel', (channelId) => {
    socket.leave(channelId);
    console.log(`User ${socket.id} left channel ${channelId}`);
  });

  // Handle sending a message to a specific channel
  socket.on('send_message_to_channel', async (data) => {
    const { channel, sender, text } = data;
    console.log(`Message in channel ${channel}: ${text}`);

    try {
      // Save message to DB
      const message = new Message({
        message: text,
        user: sender,
        lobby: channel,
      });
      const savedMessage = await message.save();

      // Emit the message to all users in the channel
      io.to(channel).emit('receive_message_from_channel', {
        sender,
        text,
        created_at: savedMessage.createdAt, // Include timestamp from DB
        messageId: savedMessage._id, // Optionally, include message ID
      });

      console.log('Message saved to DB:', savedMessage);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected: ' + socket.id);
  });
});

app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  try {
    const existingUser = await userSchema.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Cet email est déjà utilisé." });
    }

    // Hashage du mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new userSchema({
      email,
      password: hashedPassword,
    });

    user.save();

    const token = jwt.sign(
      { id: user._id, lobbies:user.lobbies },
      process.env.JWT_SECRET
    );

    res.cookie('token', token, {
      httpOnly: true, // Prevent client-side JavaScript from accessing the cookie
      secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
      sameSite: 'strict', // Protect against CSRF attacks
    });

    res.status(201).json({ message:"user created" });

  } catch {
    res.status(500).json({ err: "erreur lors de la creation de profile", err });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if(!email || !password)
    {
      res.status(401).json({error:"no password or email provided"})
      throw new Error("no email or password provided")
    }

    const user = await userSchema.findOne({email});
    if (!user) {
      console.log('Utilisateur non trouvé');
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }

     // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
       console.log('Mot de passe incorrect');
       return res.status(401).json({ message: 'Mot de passe incorrect.' });
     }

    const token = jwt.sign(
      { id: user._id, username:user.username, lobbies:user.lobbies },
      process.env.JWT_SECRET
    );

    res.cookie('token', token, {
      httpOnly: true, // Prevent client-side JavaScript from accessing the cookie
      secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
      sameSite: 'strict', // Protect against CSRF attacks
    });

    res.status(200).json({ message: " register Successful", success: true, token: token });
  } catch {
    res.status(500).json({ err: "erreur lors de la creation de profile", err });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.json({ message: "no email or password provided", success: false }); // Return an error message
      throw new Error("no email or password provided");
    }

    const user = await userSchema.findOne({ email });
    if (!user) {
      console.log("Utilisateur non trouvé");
      return res.status(404).json({ message: "Utilisateur non trouvé.", success: false });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log("Mot de passe incorrect");
      return res.status(401).json({ message: "Mot de passe incorrect.", success: false });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        lobbies: user.lobbies,
      },
      process.env.JWT_SECRET
    );

    res.cookie("token", token, {
      httpOnly: true, // Prevent client-side JavaScript from accessing the cookie
      secure: process.env.NODE_ENV === "production", // Only send over HTTPS in production
      sameSite: "strict", // Protect against CSRF attacks
    });

    res.json({ message: " login Successful", success: true, token: token });
  } catch (error) {
    console.log(error);

    res.json(error);
  }
});

app.post("/message/:serverid", verifyToken, async (req, res) => {
  const { content } = req.body;
  const lobbyId = req.params.serverid; // Get lobby ID from URL
  const userId = req.user.id;

  try {
    // Check if the lobby exists
    const lobby = await lobbySchema.findById(lobbyId);
    if (!lobby) {
      return res.status(404).json({ message: "Lobby not found." });
    }

    // Check if the user is in the lobby or is the admin
    if (!lobby.usersId.includes(userId) && lobby.admin.toString() !== userId) {
      return res.status(403).json({ message: "You are not part of this lobby." });
    }

    // Create a new message
    const newMessage = new messageSchema({
      message: content, // Ensure correct field name
      user: userId,
      lobby: lobbyId,
    });

    // Save the message to the messages collection
    const savedMessage = await newMessage.save();

    // Add the message to the lobby's messages array and save
    await lobbySchema.findByIdAndUpdate(
      lobbyId,
      { $push: { messages: savedMessage._id } }, // Push the message ID
      { new: true, useFindAndModify: false }
    );

    res.status(201).json({ message: "Message sent!", savedMessage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send message" });
  }
});


app.get("/messages/:serverid", verifyToken, async (req, res) => {
  const lobbyId = req.params.serverid; // Lobby ID from the request params
  const userId = req.user.id; // User ID from the token

  try {
    // Find the lobby by its ID
    const lobby = await lobbySchema.findById(lobbyId).populate('messages').populate('usersId');

    if (!lobby) {
      return res.status(404).json({ message: "Lobby not found." });
    }

    // Check if the user is in the lobby
    if (!lobby.usersId.includes(userId) && !lobby.admin.includes(userId)) {
      return res.status(403).json({ message: "You are not part of this lobby." });
    }

    // Get the messages (already populated through the `lobby.messages`)
    const messages = lobby.messages;

    // Return the messages in the response
    res.json({ messages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages." });
  }
});


app.get("/message/:id",verifyToken,async (req,res) => {

  const id = req.params.id

  try {
    const lobby = await messageSchema.find({_id : id})  // Fetch all items from the collection

    res.status(200).json(lobby);  // Return the lobby data in the response
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération du message.', error });
  }
  
})



app.get("/users",async (req,res) => {

  try {
    const lobby = await userSchema.find(); // Fetch all items from the collection

    res.status(200).json(lobby); // Return the lobby data in the response
  } catch (error) {
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des lobbies.", error });
  }
});

app.get("/users/:id", verifyToken, async (req, res) => {
  const id = req.params.id;

  try {
    const lobby = await userSchema.find({ _id: id }); // Fetch all items from the collection

    res.status(200).json(lobby); // Return the lobby data in the response
  } catch (error) {
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des lobbies.", error });
  }
});

app.get("/lobbies", verifyToken, async (req, res) => {
  try {
    const lobby = await lobbySchema.find()  // Fetch all items from the collection

    console.log(lobby);

    res.status(200).json(lobby); // Return the lobby data in the response
  } catch (error) {
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des lobbies.", error });
  }
});

app.get("/lobbies/:id", verifyToken, async (req, res) => {
  const id = req.params.id;

  try {
    const lobby = await lobbySchema.find({_id:id})  // Fetch all items from the collection

    res.status(200).json(lobby); // Return the lobby data in the response
  } catch (error) {
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des lobbies.", error });
  }
});

app.post("/createLobby", verifyToken, (req, res) => {
  const user = req.user;

  const lobby = new lobbySchema({admin:user.id})

  lobby.save();

  res.json(lobby);
});

app.post("/createInviteLink", verifyToken, (req, res) => {
  const user = req.user;
  const currentLobby = req.body.serverId;

  const link = `${API_URL}/joinLobby/${currentLobby}`;

  res.json({ serverlink: link });
});

app.put("/joinLobby/:id", verifyToken, async (req, res) => {
  try {
    const user = req.user; // The current user from the JWT token
    const lobbyId = req.params.id; // Corrected: use `id` from the route params

    // Find the lobby by its ID
    const lobby = await lobbySchema.findById(lobbyId);
    if (!lobby) {
      return res.status(404).json({ message: "Lobby not found" });
    }

    // Check if the user is already in the lobby
    if (lobby.usersId.includes(user.id)) {
      return res.json({ message: "You are already in this lobby" });
    }

    // Add the user to the lobby
    lobby.usersId.push(user.id);
    await lobby.save();

    res.json({ message: "Joined lobby successfully!", lobby });
  } catch (error) {
    res.status(500).json({ error: "Failed to join lobby" });
  }
});
