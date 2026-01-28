# LyrinEye Project Backlog

This file contains features and improvements planned for future versions of LyrinEye.

## Phase 10: Remote Auto-Update
- **Goal**: Allow dedicated monitor devices (like Nokia 2) to update themselves without physical intervention.
- **Backend Requirements**:
    - Add `/version/latest` endpoint returning the latest APK URL and build number.
    - Metadata storage for current production version.
- **Mobile Requirements**:
    - `UpdateService` to check version on every app start.
    - APK Download manager using `ReactNativeBlobUtil`.
    - Intent trigger to launch the Android System Installer.
- **CI/CD Requirements**:
    - GitHub Action to upload the built APK to Azure Blob Storage `apps` container upon release.

## Future Ideas
- [ ] **AI Object Detection**: Integrate TensorFlow Lite to detect humans/pets locally on the monitor.
- [ ] **Push Notifications**: Notify the Viewer when motion is detected even if the app is closed.
- [ ] **Two-Way Audio**: Allow the Viewer to talk through the Monitor's speaker.
- [ ] **Cloud Storage Plans**: Implement user tiers for recording retention duration.
