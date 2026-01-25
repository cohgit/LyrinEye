# LyrinEye - Zero-Cost Security Camera

LyrinEye transforms your spare Android devices into a smart security camera system with zero operational costs using cloud free tiers.

## Architecture

- **Backend:** Azure Container Apps (Consumption Plan).
- **Metadata Storage:** Azure Table Storage (No-SQL, Low Cost).
- **Video Storage:** Azure Blob Storage.
- **CI/CD:** GitHub Actions with OIDC for secure deployment.
- **State Management:** Terraform Cloud.

## Project Structure

- `/infrastructure`: Terraform manifests for cloud resources.
- `.github/workflows`: CI/CD pipelines.

## Getting Started

### Prerequisites
1. **Azure Subscription:** Ensure you have an active subscription.
2. **Terraform Cloud Account:** Create an organization and token.
3. **GitHub Secrets:** Configure the following secrets in your repository:
   - `AZURE_CLIENT_ID`: Application (client) ID for OIDC.
   - `AZURE_TENANT_ID`: Directory (tenant) ID.
   - `AZURE_SUBSCRIPTION_ID`: Your Azure Subscription ID.
   - `TF_API_TOKEN`: Your Terraform Cloud API token.

### Initial Setup
1. Update `infrastructure/main.tf` with your Terraform Cloud organization name.
2. Run `terraform init` locally to verify connectivity.
3. Push to `main` to trigger the first deployment.

## Mobile App (APK)
The APK is built via GitHub Actions and available in the **Releases** section of this repository.

### Monitor Mode
Activate this on the device you want to use as a camera. It will stream live video via WebRTC.

### Viewer Mode
Use this to see your cameras and browse historical clips stored in Azure.
