import os
B = '/Users/maxkarimi/Desktop/work/bitpin/redis-gui'
def w(path, content):
  os.makedirs(os.path.dirname(path), exist_ok=True)
  open(path,'w').write(content); print('wrote',path)
# --- Dockerfile ---
w(B+'/frontend/Dockerfile', '''# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (takes advantage of Docker layer caching)
COPY package*.json ./
RUN npm ci

# Copy application source and compile
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

# Remove default nginx placeholder page
RUN rm -rf /usr/share/nginx/html/*

# Copy the compiled React app from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy our SPA-aware nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

''')
open(B+'/frontend/Dockerfile','a').write('CMD [' + chr(34) + 'nginx' + chr(34) + ', ' + chr(34) + '-g' + chr(34) + ', ' + chr(34) + 'daemon off' + chr(59) + chr(34) + ']' + chr(10))
