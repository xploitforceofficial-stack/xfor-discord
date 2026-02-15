FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source files
COPY . .

# Create databases directory
RUN mkdir -p databases

# Make start script executable
RUN chmod +x start.sh

# Start the bot
CMD ["./start.sh"]
