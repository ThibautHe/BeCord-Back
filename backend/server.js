const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cookieParser = require("cookie-parser");
const cookie = require("cookie");
const userSchema = require("../models/UserSchema");
const messageSchema = require("../models/MessageSchema");
const lobbySchema = require("../models/LobbySchema");
const verifyToken = require("./verifyJwt");
const { connectToDb } = require("./db");
const API_URL = "http://localhost:3000";
const API_FETCH = "http://localhost:5173";
const { ObjectId } = require("mongodb");

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
    origin: ["http://localhost:3000","http://localhost:5173"], // ✅ Autorise les deux ports
    methods: ["GET", "POST"],
    withCredentials: true,
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

  const cookies = cookie.parse(socket.handshake.headers.cookie || ""); // Parse cookies
  const token = cookies.token; // Extract JWT token

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  
  console.log(decoded.id);
  
  // Handle joining a channel (lobby)
  socket.on('join_channel', async (channel) => {

    console.log("CHANNEL ID :", channel._id);
    
    const user = await userSchema.findById(decoded.id);
    if (user) {
      socket.join(channel._id);
      console.log(`User ${user.email} joined channel ${channel.name}`);
    }
  });

  // Handle leaving a channel (lobby)
  socket.on('leave_channel', (channel) => {
    socket.leave(channel);
    console.log(`User ${socket.id} left channel ${channel}`);
  });

    // Modifier un channel
    app.put("/channel/:channelName", async (req, res) => {
      const { channelName } = req.params;
      const { newChannelName } = req.body;
  
      try {
        const existingChannel = await Channel.findOne({ name: newChannelName });
        if (existingChannel) {
          return res.status(400).json({ error: "Le nom du channel existe déjà." });
        }
  
        const channel = await Channel.findOneAndUpdate(
          { name: channelName },
          { name: newChannelName },
          { new: true }
        );
  
        if (!channel) {
          return res.status(404).json({ error: "Channel introuvable" });
        }
  
        io.emit("channel_updated", { oldName: channelName, newName: newChannelName });
        res.status(200).json({ message: "Channel modifié" });
      } catch (err) {
        console.error("Erreur modification channel:", err);
        res.status(500).json({ error: "Erreur modification channel" });
      }
    });
  
    // Supprimer un channel et ses messages
    app.delete("/channel/:channelName", async (req, res) => {
      const { channelName } = req.params;
      try {
        await Channel.deleteOne({ name: channelName });
        await Message.deleteMany({ channel: channelName });
        io.emit("channel_deleted", channelName); // Notifier tous les clients
        res.status(200).json({ message: "Channel supprimé" });
      } catch (err) {
        res.status(500).json({ error: "Erreur lors de la suppression" });
      }
    });

    socket.on('send_message_to_channel', async (data) => {
      const { channel, sender, text } = data;
      console.log(`Message in channel ${channel.name}: ${text}`);
  
      try {
          // Save message to DB
          const message = new messageSchema({
              message: text,
              user: decoded.id, // Assuming sender is the user ID
              lobby: channel._id, // Assuming channel is the lobby ID
          });
  
          const savedMessage = await message.save();
  
          // Populate user to get the email
          const populatedMessage = await messageSchema.findById(savedMessage._id)
          .populate({ path: 'user', select: 'email' }); 

          // Add message ID to lobby
          await lobbySchema.findByIdAndUpdate(
              channel._id,
              { $push: { messages: savedMessage._id } },
              { new: true }
          );
  
          console.log('Message saved:', populatedMessage);

          // Emit message to all users in the channel with populated user info
          io.to(channel._id).emit('receive_message_from_channel',
            populatedMessage
          );
  
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
    if(!email || !password)
      {
        return res.status(401).json({error:"no password or email provided"})
      }

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
      return res.status(401).json({error:"no password or email provided"})
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
  } catch(error) {
    res.status(500).json({ err: "erreur lors de la creation de profile",error });
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


app.get("/lobbyMessages/:serverid", verifyToken, async (req, res) => {
  const lobbyId = req.params.serverid; // Lobby ID from the request params
  const userId = new ObjectId(req.user.id); // User ID from the token

  try {
    // Find the lobby by its ID
    const lobby = await lobbySchema
  .findById(lobbyId)
  .populate({
    path: 'messages',
    populate: { path: 'user', select: 'email' } // Récupère les infos des utilisateurs
  })
  .populate('usersId'); 

  console.log(lobby.usersId)

    if (!lobby) {
      return res.status(404).json({ message: "Lobby not found." });
    }

    const isMember = lobby.usersId.some((user) => user.equals(userId));
    const isAdmin = lobby.admin.some((adminId) => adminId.equals(userId));

    if (!isMember && !isAdmin) {
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
    console.log(req.user);
    
    const userId = req.user.id; // Get the user ID from the token

    const lobbies = await lobbySchema.find({
      $or: [{ usersId: userId }, { admin: userId }]
    });

    res.status(200).json(lobbies);
  } catch (error) {
    res.status(500).json({
      message: "Erreur lors de la récupération des lobbies.",
      error,
    });
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

app.post("/createLobby", verifyToken, async (req, res) => {
  const user = req.user;
  const { name } = req.body; // Name is optional

  try {
    // Create and save the new lobby
    const lobby = new lobbySchema({ name,user:user.id, admin: user.id });
    const savedLobby = await lobby.save();

    res.json(savedLobby); // Return the created lobby
  } catch (error) {
    console.error("Erreur lors de la création du lobby:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
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