const mongoose = require("mongoose");
const express = require("express");
const bcrypt = require("bcryptjs");
const userSchema = require("../models/UserSchema");
const LobbySchema = require("../models/LobbySchema");
const jwt = require("jsonwebtoken");
const verifyToken = require("./verifyJwt");
const { connectToDb } = require("./db");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const API_URL = "http://localhost:3000";

dotenv.config();

const app = express();

app.use(express.json());
app.use(cookieParser()); // Enable cookie parsing

connectToDb(() => {
  app.listen(3000, () => {
    console.log("app is listening on port " + 3000);
  });
});

app.post(`${API_URL}/register`, async (req, res) => {
  const { email, password, username } = req.body;
  try {
    const existingUser = await userSchema.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Cet email est déjà utilisé." });
    }

    // Hashage du mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new userSchema({
      username,
      email,
      password: hashedPassword,
    });

    user.save();

    res.status(201).json({ message: "user created" });
  } catch {
    res.status(500).json({ err: "erreur lors de la creation de profile", err });
  }
});

app.post(`${API_URL}/login`, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new Error("no email or password provided");
    }

    const user = await userSchema.findOne({ email });
    if (!user) {
      console.log("Utilisateur non trouvé");
      return res.status(404).json({ message: "Utilisateur non trouvé." });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log("Mot de passe incorrect");
      return res.status(401).json({ message: "Mot de passe incorrect." });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        username: user.username,
        lobbies: user.lobbies,
      },
      process.env.JWT_SECRET
    );

    res.cookie("token", token, {
      httpOnly: true, // Prevent client-side JavaScript from accessing the cookie
      secure: process.env.NODE_ENV === "production", // Only send over HTTPS in production
      sameSite: "strict", // Protect against CSRF attacks
    });

    res.json({ message: " login Successful", token: token });
  } catch (error) {
    console.log(error);

    res.json(error);
  }
});

app.get(`${API_URL}/users`, verifyToken, async (req, res) => {
  try {
    const lobby = await userSchema.find(); // Fetch all items from the collection

    res.status(200).json(lobby); // Return the lobby data in the response
  } catch (error) {
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des lobbies.", error });
  }
});

app.get(`${API_URL}/users/:id`, verifyToken, async (req, res) => {
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

app.get(`${API_URL}/lobbies`, verifyToken, async (req, res) => {
  try {
    const lobby = await LobbySchema.find(); // Fetch all items from the collection

    console.log(lobby);

    res.status(200).json(lobby); // Return the lobby data in the response
  } catch (error) {
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des lobbies.", error });
  }
});

app.get(`${API_URL}/lobbies/:id`, verifyToken, async (req, res) => {
  const id = req.params.id;

  try {
    const lobby = await LobbySchema.find({ _id: id }); // Fetch all items from the collection

    res.status(200).json(lobby); // Return the lobby data in the response
  } catch (error) {
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des lobbies.", error });
  }
});

app.post(`${API_URL}/createLobby`, verifyToken, (req, res) => {
  const user = req.user;

  const lobby = new LobbySchema({ admin: user.id });

  lobby.save();

  res.json(lobby);
});

app.post(`${API_URL}/createInviteLink`, verifyToken, (req, res) => {
  const user = req.user;
  const currentLobby = req.body.serverId;

  const link = `http://localhost:3000/joinLobby/${currentLobby}`;

  res.json({ serverlink: link });
});

app.put(`${API_URL}/joinLobby/:id`, verifyToken, async (req, res) => {
  try {
    const user = req.user; // The current user from the JWT token
    const lobbyId = req.params.id; // Corrected: use `id` from the route params

    // Find the lobby by its ID
    const lobby = await LobbySchema.findById(lobbyId);
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
