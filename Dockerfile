FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies - menggunakan npm install instead of npm ci
RUN npm install --production

# Copy source files
COPY . .

# Create databases directory
RUN mkdir -p databases && \
    chmod +x start.sh

# Make start script executable
RUN chmod +x start.sh

# Start the bot
CMD ["./start.sh"]
