# Placeholders only — Phase 0 structure, not applied. Real values are set out
# of band (console/CI secret injection), never as Terraform variables, so they
# never land in state or plan output in plaintext.

resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "nestora/${var.environment}/db-credentials"
  description = "RDS Postgres master credentials for the API tier"

  tags = {
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db_master.result
    host     = aws_db_instance.postgres.address
    port     = aws_db_instance.postgres.port
    dbname   = var.db_name
  })
}

# JWT RS256 signing key (SRS §9.9/§12) — generated and stored out of band
# (never by Terraform, which would put the private key in state); this
# resource is the placeholder the API container reads from at boot.
resource "aws_secretsmanager_secret" "jwt_signing_key" {
  name        = "nestora/${var.environment}/jwt-signing-key"
  description = "RS256 private key for access-token signing. Value set out of band, not by Terraform."

  tags = {
    Environment = var.environment
  }
}
