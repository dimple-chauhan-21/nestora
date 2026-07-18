resource "random_password" "db_master" {
  length  = 32
  special = false # RDS master password: avoid chars that need URL-encoding in DATABASE_URL
}

# Placeholder for the real secret — Terraform writes the generated password
# into Secrets Manager, never into state as a plain output, and the app reads
# it at boot (see secrets.tf). No credentials are hand-entered anywhere.
resource "aws_db_instance" "postgres" {
  identifier     = "nestora-${var.environment}-postgres"
  engine         = "postgres"
  engine_version = "16"

  instance_class        = var.db_instance_class
  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_master.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  multi_az                = var.environment == "production"
  publicly_accessible     = false

  backup_retention_period = 7 # nightly backups; WAL archiving configured separately (SRS §16)
  deletion_protection     = var.environment == "production"
  skip_final_snapshot     = var.environment != "production"

  tags = {
    Name        = "nestora-${var.environment}-postgres"
    Environment = var.environment
  }
}
