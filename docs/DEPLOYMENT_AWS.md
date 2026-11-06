# AWS deployment (S3 + EC2)

## S3
1. Create a bucket (e.g. `smartvision-<yourname>`), keep "Block public access" ON.
2. Folders used by the app: `uploads/`, `gradcam/`, `models/`.
3. Set `USE_S3=true`, `S3_BUCKET=<bucket>`, `AWS_REGION=<region>` in `backend/.env`.

## IAM role (no keys in code)
Create a role for EC2 with a policy allowing `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` on your bucket, attach it to the instance.

## EC2
1. Launch Ubuntu 22.04, `t3.large` (8 GB RAM; TensorFlow needs memory), 20 GB disk.
2. Security group: 22 (your IP only), 8000 (or 80/443 behind Nginx).
3. Install Docker: `sudo apt update && sudo apt install -y docker.io docker-compose-v2`.
4. Copy the project (git clone), put the model in `backend/models/`, create `backend/.env`.
5. `docker compose up -d --build`
6. Test: `curl http://<EC2-IP>:8000/health`
7. Point the React `.env` to `http://<EC2-IP>:8000` and add the frontend URL to `CORS_ORIGINS`.

## Frontend hosting (optional)
Build with `npm run build` and host on S3 static website or Nginx on the same EC2.
