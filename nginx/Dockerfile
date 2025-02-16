FROM nginx:latest

# Install OpenSSL
RUN apt-get update && apt-get install -y openssl

# Generate a self-signed certificate
RUN mkdir -p /etc/nginx/certs/ && \
    openssl req -newkey rsa:4096 -x509 -sha256 -days 365 -nodes \
    -out  /etc/nginx/certs/certificate.crt \
    -keyout /etc/nginx/certs/certificate.key  \
    -subj "/C=BE/ST=Bruxelles/L=Bruxelles/O=19/OU=19/CN=localhost"

# Copy Nginx config
COPY conf/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 443
CMD ["nginx", "-g", "daemon off;"]
