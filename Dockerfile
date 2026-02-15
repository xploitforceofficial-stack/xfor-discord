FROM node:18-alpine

WORKDIR /app

# Install bash (optional, but recommended)
RUN apk add --no-cache bash

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source files
COPY . .

# Create databases directory
RUN mkdir -p databases

# Make start script executable
RUN chmod +x start.sh

# Start the bot - use sh instead of bash
CMD ["sh", "start.sh"]
