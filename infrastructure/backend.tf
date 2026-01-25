terraform {
  cloud {
    organization = "cogalde"
    
    workspaces {
      name = "lyrineye-infra"
    }
  }
}
