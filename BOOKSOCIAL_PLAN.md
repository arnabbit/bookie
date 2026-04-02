# Booksocial - Social Book Sharing App

A social app where users browse books, add friends, share book pages, and chat — like Instagram but for book pages instead of reels.

## Architecture

### Backend (Express + MongoDB)
- `server/` — Express app
- `server/src/models/` — MongoDB schemas (User, Book, FriendRequest, Friendship, Conversation, Message)
- `server/src/routes/` — API routes
- `server/src/middleware/` — Auth, validation

### Frontend (React Native / Expo — existing app)
- Modified to load books from backend instead of local storage
- Google Auth with custom username selection
- Friend system (search, request, accept)
- Chat interface with text-only messages
- Book page sharing between friends

## Tech Stack
- **Backend**: Express.js, MongoDB (Mongoose), JWT, Passport Google OAuth
- **Frontend**: React Native / Expo (existing app, significantly modified)
- **Auth**: Google OAuth 2.0 + JWT sessions
- **Real-time**: Socket.io for chat
