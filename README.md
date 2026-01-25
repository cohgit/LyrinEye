# LyrinEye - Zero-Cost Security Camera System

LyrinEye is a mobile-first security solution designed to leverage cloud "forever-free" or low-cost tiers. It transforms Android devices into smart cameras with remote monitoring and historical playback.

## 🚀 Project Specifications

- **Architecture Strategy:** Zero-Cost infrastructure using Azure.
- **Compute:** Azure Container Apps (Consumption Plan) with scaling to zero.
- **Data Storage (V1):** No traditional Database. Uses **Azure Table Storage** for metadata and **Azure Blob Storage** for video clips.
- **Distribution:** Mobile Android APK generated via CI/CD and distributed through **GitHub Releases**.
- **CI/CD:** GitHub Actions with **OIDC Authentication** (Zero-Secret strategy for Azure credentials).
- **State Management:** Terraform Cloud (Organization: `cogalde`).

## 🛠 Tech Stack
- **Infrastructure:** Terraform (Azure Provider).
- **Backend:** Node.js/Go (to be defined) in Container Apps.
- **Mobile:** Android (Kotlin/Native or React Native - TBD).

## 🔒 Security & Public Repository Guidelines

> [!IMPORTANT]
> This is a **Public Repository**. 

- **No Secrets in Code:** All sensitive values (IDs, tokens, connection strings) MUST be handled via GitHub Secrets or environment variables.
- **Identity:** Use OIDC for Azure authentication to avoid storing Service Principal keys.
- **State:** Terraform state is stored securely in Terraform Cloud.

## 📁 Repository Structure
- `/infrastructure`: Terraform manifests for Azure resources.
- `.github/workflows`: Deployment and build pipelines.

## 🚦 Getting Started
Follow the [Deployment Walkthrough](.gemini/antigravity/brain/walkthrough.md) to set up your environment, Azure Federated Credentials, and GitHub Secrets.
