# SmartVision: AWS Deployment (EC2 + S3 + Docker)

**Status:** deployed and verified on 2026-10-25. Predict, Explain (Grad-CAM) and AI-image detection work from the cloud, and uploads and heatmaps are stored in S3.

This document describes what was actually built and how to repeat or update it.

---

## 1. Architecture

```
 Browser  ──HTTP :80──▶  EC2 instance "SmartVision-Server" (Ubuntu 26.04, Mumbai)
                          │
                          │  docker compose (cloud/docker-compose.yml)
                          │
                          ├── web      Nginx: serves the React build, proxies /api/* to the backend
                          │
                          └── backend  FastAPI + ResNet-50 (ImageNet) + Grad-CAM + AI detector (CLIP)
                                  │
                                  └── IAM role SmartVisionEC2Role (no keys in code)
                                          │
                                          ▼
                                  S3 bucket  smartvision-2026
                                     uploads/   images sent to /predict
                                     gradcam/   heatmaps made by /explain
                                     models/    ai_detector.joblib + class lists
```

| Layer | Choice |
|---|---|
| Compute | EC2 `m7i-flex.large` (2 vCPU, 8 GiB RAM, free-tier eligible), Ubuntu Server 26.04 LTS, 30 GiB gp3 |
| Region | Asia Pacific (Mumbai) `ap-south-1` |
| Storage | S3 bucket `smartvision-2026`, public access blocked |
| Access control | IAM role `SmartVisionEC2Role` with policy `SmartVisionS3Access` |
| Containers | Docker + Docker Compose |
| Web server | Nginx (inside the `web` container) |
| Backend | FastAPI (1 uvicorn worker), Python 3.13, TensorFlow-CPU, CPU-only PyTorch |
| Classifier | Pretrained ImageNet ResNet-50 (`MODEL_BACKEND=imagenet`) |
| AI-image detector | CLIP ViT-B/32 features + LogisticRegression (`models/ai_detector.joblib`) |

---

## 2. Files used for deployment

| File | Purpose |
|---|---|
| `backend/Dockerfile` | Python 3.13 image; installs CPU-only torch first, then `requirements.txt`; `COPY . .` (needed because `ai_detector.py` sits next to `app/`) |
| `backend/.dockerignore` | Keeps `.venv`, `models`, datasets, tests and `.env` out of the image |
| `backend/requirements.txt` | Package versions pinned to the working local `.venv` |
| `backend/requirements-dev.txt` | Adds `pytest` and `httpx` for local testing only |
| `frontend/Dockerfile` | Builds the React app with `VITE_API_URL=/api`, then serves it with Nginx |
| `frontend/nginx.conf` | `/api` proxy, 12 MB upload limit, rate limit, single-page-app fallback |
| `cloud/docker-compose.yml` | Runs `backend` and `web`, mounts models and weight caches |
| `cloud/backend.env.example` | Template for the server's `backend.env` |
| `cloud/iam-policy.json` | S3 permissions for the instance role |
| `cloud/ec2-setup.sh` | One-time server preparation (Docker, AWS CLI, swap) |

Note: always run `docker compose` from the `cloud/` folder. Any older `docker-compose.yml` in the project root is not used for the cloud deployment.

Why the frontend calls `/api`: the React app has its own routes (for example `/predict` and `/history`), so the API lives under `/api` to avoid clashing with page refreshes. Nginx strips the prefix before passing the request to FastAPI.

---

## 3. Server settings (`cloud/backend.env`)

This file is created on the server only and is never committed to Git. Do not put comments on the same line as a value.

```
MODEL_BACKEND=imagenet
MODEL_PATH=models/resnet50_cifar100.keras
LABELS_PATH=models/cifar100_classes.json
INPUT_SIZE=224
PREPROCESS=resnet
CONF_THRESHOLD=0.40
TOP_K=3
MAX_UPLOAD_MB=10
CORS_ORIGINS=http://YOUR_PUBLIC_IP
USE_S3=true
AWS_REGION=ap-south-1
S3_BUCKET=smartvision-2026
```

`MAX_UPLOAD_MB` must not be larger than `client_max_body_size` in `frontend/nginx.conf` (12m), or Nginx rejects big photos with HTTP 413.

---

## 4. One-time setup in the AWS console

Keep the console on **Asia Pacific (Mumbai)** for every step.

### 4.1 S3 bucket
1. S3 → **Create bucket**, name `smartvision-2026`, keep **Block all public access** ticked.
2. Create folders `uploads`, `gradcam` and `models`.
3. Upload `ai_detector.joblib`, `cifar100_classes.json` and `cifar10_classes.json` into `models/`.

### 4.2 IAM policy and role
1. IAM → Policies → Create policy → JSON tab. Paste the contents of `cloud/iam-policy.json` with your bucket name filled in. Name it `SmartVisionS3Access`.
2. IAM → Roles → Create role → AWS service → **EC2** → attach `SmartVisionS3Access` → name it `SmartVisionEC2Role`.

### 4.3 Launch the EC2 instance
EC2 → **Launch instance**:

| Setting | Value |
|---|---|
| Name | `SmartVision-Server` |
| AMI | Ubuntu Server 26.04 LTS (HVM), SSD Volume Type (plain image, no pre-installed software) |
| Instance type | `m7i-flex.large` (marked Free tier eligible) |
| Key pair | Create `smartvision-key` (RSA, `.pem`) and store the file safely, outside the project folder |
| Security group | `smartvision-sg`: **SSH (22) from My IP**, **HTTP (80) from Anywhere**. Remove any "All traffic" rule |
| Storage | 30 GiB gp3 |
| Advanced → IAM instance profile | `SmartVisionEC2Role` |
| Advanced → Metadata response hop limit | **2** (without it, containers cannot use the IAM role) |
| Advanced → Termination protection | Enable (optional, prevents accidental deletion) |

---

## 5. Prepare the server (once)

### 5.1 Connect from Windows
Lock the key file so SSH accepts it (Command Prompt):
```
icacls "D:\smartvision-key.pem" /inheritance:r
icacls "D:\smartvision-key.pem" /grant:r "%USERNAME%:(R)"
icacls "D:\smartvision-key.pem" /remove "NT AUTHORITY\Authenticated Users"
icacls "D:\smartvision-key.pem" /remove "BUILTIN\Users"
```
Connect:
```
ssh -i "D:\smartvision-key.pem" ubuntu@YOUR_PUBLIC_IP
```

### 5.2 Install Docker, AWS CLI and swap (on the server)
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo snap install aws-cli --classic

sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

sudo mkdir -p /opt/smartvision/models
sudo chown -R $USER: /opt/smartvision
```
Log out (`exit`) and connect again so the Docker group applies, then check:
```bash
docker --version
docker compose version
aws --version
free -h
```

### 5.3 Check S3 access, including from inside a container
```bash
aws s3 ls s3://smartvision-2026/models/ --region ap-south-1
docker run --rm amazon/aws-cli s3 ls s3://smartvision-2026/models/ --region ap-south-1
```
Both must list your model files. If the second says "Unable to locate credentials", the metadata hop limit is not 2.

### 5.4 Copy the models onto the server
```bash
aws s3 sync s3://smartvision-2026/models/ /opt/smartvision/models/ --region ap-south-1
ls -la /opt/smartvision/models/
```
The folder is mounted read-only at `/srv/models` inside the backend container, which is where `ai_detector.py` looks for `models/ai_detector.joblib`.

---

## 6. Deploy the code

### 6.1 Pack the project (on the laptop, PowerShell)
```powershell
cd D:\
tar -czf D:\smartvision-deploy.tar.gz --exclude=.venv --exclude=node_modules --exclude=dist --exclude=__pycache__ --exclude=dataset --exclude=cifar-10-batches-py --exclude=cifar-100-python --exclude="*.keras" --exclude="*.h5" --exclude="*.pem" --exclude=.env --exclude=.git --exclude=SmartVision.zip SmartVision
scp -i "D:\smartvision-key.pem" D:\smartvision-deploy.tar.gz ubuntu@YOUR_PUBLIC_IP:~/
```
The archive should be about 10 MB. `.env` and `.pem` files must not be inside it.

### 6.2 Build and start (on the server)
```bash
cd ~
tar -xzf smartvision-deploy.tar.gz
cd SmartVision/cloud
cp backend.env.example backend.env      # first time only
nano backend.env                        # set CORS_ORIGINS and S3_BUCKET
nohup docker compose up -d --build > build.log 2>&1 &
tail -f build.log
```
The first build takes 10 to 20 minutes (TensorFlow, torch and the Node build). Press `Ctrl+C` to stop watching; the build keeps running. It is finished when the log shows `Container cloud-backend-1 Healthy` and `Container cloud-web-1 Started`.

### 6.3 Test
On the server:
```bash
docker compose ps
curl http://localhost/api/health
curl http://localhost/api/model-info
```
In a browser open `http://YOUR_PUBLIC_IP` (type `http://` explicitly) and test:
1. **Predict**: top-3 results appear.
2. **Explain**: the Grad-CAM heatmap appears.
3. **AI detect**: returns Real or AI-generated with a confidence.

The first predict downloads the ImageNet weights (about 100 MB) and the first AI-detect downloads the CLIP weights (about 600 MB), so those first requests are slow. Both are cached in Docker volumes afterwards.

Confirm S3 storage:
```bash
aws s3 ls s3://smartvision-2026/uploads/ --region ap-south-1
aws s3 ls s3://smartvision-2026/gradcam/ --region ap-south-1
```

---

## 7. Updating after a code change

1. Repack and copy the project (section 6.1).
2. On the server:
```bash
cd ~
tar -xzf smartvision-deploy.tar.gz
cd SmartVision/cloud
docker compose up -d --build
docker image prune -f
```
`backend.env` is not in the archive, so the server's settings are kept. Rebuilds are quick because only the code layer changes.

---

## 8. Day-to-day operation

| Task | How |
|---|---|
| Stop the server (saves credits) | EC2 console → select instance → **Instance state → Stop** (not Terminate) |
| Start the server | **Instance state → Start**, wait for **2/2 checks passed**, copy the new **Public IPv4 address** |
| After a restart | The public IP is new. Open `http://NEW_IP`. If the site is down, run `cd ~/SmartVision/cloud && docker compose up -d` |
| View logs | `docker compose logs --tail 50 backend` |
| Check containers | `docker compose ps` |
| Free disk space | `docker image prune -f` and `df -h /` |
| Stable address (optional) | Allocate an Elastic IP and associate it with the instance; release it when the project ends |

Because the public IP changes on every start, `CORS_ORIGINS` does not matter for the same-origin setup (the browser talks to the same address that serves the page).

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ssh` or `scp` times out | Home IP changed, so the SSH rule no longer matches | Security group `smartvision-sg` → edit inbound rules → SSH source = **My IP** |
| SSH says "UNPROTECTED PRIVATE KEY FILE" | Key file readable by other users | Run the `icacls` commands in section 5.1 |
| Upload fails with HTTP 413 | Nginx upload limit too small | `client_max_body_size` in `frontend/nginx.conf` must be at least `MAX_UPLOAD_MB` |
| `Unable to locate credentials` inside the container | Metadata hop limit is 1 | Set **Metadata response hop limit = 2** (Instance → Actions → Instance settings → Modify instance metadata options) |
| `NoSuchBucket` | Placeholder or wrong bucket name | Use `smartvision-2026` exactly |
| Backend crashes with `No module named 'ai_detector'` | Dockerfile copied only `app/` | Use `COPY . .` in `backend/Dockerfile` |
| `permission denied` on `docker` | Docker group not applied yet | Log out and back in |
| Build stops with "no matching distribution" | A pinned package has no build for the Python version | Check `PYTHON_VERSION` in `backend/Dockerfile` matches the local `.venv` (3.13) |
| First AI-detect request is very slow | CLIP weights downloading (about 600 MB) | Wait once; cached afterwards |
| Disk full | Old image layers from rebuilds | `docker image prune -f` |
| Page does not load | Browser switched to `https://` | Use `http://YOUR_PUBLIC_IP` |

---

## 10. Security notes

- SSH is open only to the developer's own IP; HTTP (80) is the only public port. The backend port 8000 is not exposed.
- No AWS access keys exist in the code or on the server. S3 access comes from the instance role with the smallest set of permissions (`ListBucket`, `GetObject`, `PutObject` on one bucket).
- The S3 bucket blocks all public access.
- The `.pem` key, `.env` and `cloud/backend.env` must never be pushed to GitHub (they are excluded by `.gitignore` and by the archive command).
- Nginx limits each client IP to about one API request per second (with a burst allowance).
- The site uses plain HTTP. HTTPS would need a domain name and a certificate.

---

## 11. Cost control (AWS Free plan)

- The account runs on the AWS Free plan: usage is paid from the plan's credits, and the plan lasts a fixed number of days from account creation. At deployment the console showed the plan ending around 27 January 2027, after which the account and its resources are removed. Export anything needed before then.
- A running instance uses credits; a stopped instance does not (the disk still does, at a small rate). Stop the instance whenever it is not being used or demonstrated.
- Check the **Credits** page in Billing and Cost Management to see the remaining balance.

---

## 12. Scope of the deployed version

- Classification uses the pretrained ImageNet ResNet-50. The CIFAR-100 files are kept in `models/` but are not used (`MODEL_BACKEND=imagenet`).
- The `/detect-ai` endpoint runs the CLIP + LogisticRegression detector saved in `models/ai_detector.joblib`.
- Login and prediction history (JWT and PostgreSQL in the original proposal) are not part of the deployed API.
- BLIP image captioning is not part of the deployed version.
