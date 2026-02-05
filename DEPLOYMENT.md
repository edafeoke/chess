# Vercel Deployment Guide

## ⚠️ Important Note About Socket.IO

**Socket.IO with persistent WebSocket connections has significant limitations on Vercel's traditional serverless platform.** 

The main issues:
- Serverless functions are stateless and short-lived
- WebSocket connections require persistent state
- Game state (games Map, waitingPlayers) will be lost between function invocations
- Multiple function instances can't share state

**Recommended Alternatives for Production:**
1. **Railway** - Excellent WebSocket support, easy deployment
2. **Render** - Full Node.js support with persistent connections
3. **Fly.io** - Great for real-time applications
4. **Heroku** - Traditional hosting with reliable WebSocket support
5. **DigitalOcean App Platform** - Good WebSocket support

If you must use Vercel, consider:
- Using Vercel's newer WebSocket support (experimental/beta)
- Moving game state to an external database (Redis, MongoDB)
- Using a separate WebSocket service (like Pusher, Ably, or a dedicated server)

## Deployment Steps

### 1. Install Vercel CLI (if not already installed)
```bash
npm i -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Deploy
From your project directory:
```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Yes**
- Which scope? (Select your account)
- Link to existing project? **No** (for first deployment)
- Project name? (Press Enter for default or enter a name)
- Directory? (Press Enter for current directory)
- Override settings? **No**

### 4. Production Deployment
```bash
vercel --prod
```

## Configuration

The `vercel.json` file is already configured with:
- Node.js serverless function for `server.js`
- Routes for Socket.IO and static files
- Production environment variables

## Environment Variables (Optional)

If you need any environment variables, set them via:
1. Vercel Dashboard → Your Project → Settings → Environment Variables
2. Or via CLI: `vercel env add VARIABLE_NAME`

## Alternative Deployment Options

If Socket.IO doesn't work reliably on Vercel, consider:

1. **Railway** - Better WebSocket support
2. **Render** - Full Node.js support with persistent connections
3. **Fly.io** - Good for real-time applications
4. **Heroku** - Traditional hosting with WebSocket support

## Testing After Deployment

1. Visit your Vercel URL
2. Test the multiplayer functionality
3. Check browser console for any connection errors
4. Monitor Vercel function logs in the dashboard

## Troubleshooting

- **Socket.IO connection issues**: Check that the Socket.IO client is connecting to the correct URL
- **Function timeout**: Vercel has execution time limits; consider upgrading plan if needed
- **WebSocket errors**: May need to use Vercel's newer WebSocket support (experimental)
