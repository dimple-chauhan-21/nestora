resource "aws_s3_bucket" "documents" {
  bucket = "${var.documents_bucket_name}-${var.environment}"

  tags = {
    Name        = "nestora-${var.environment}-documents"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Module 21: separate encrypted prefix for is_sensitive documents. Modeled as
# its own bucket (not just a prefix) so it gets a distinct, stricter IAM
# policy and can move to KMS-CMK envelope encryption independently later.
resource "aws_s3_bucket" "documents_sensitive" {
  bucket = "${var.documents_bucket_name}-sensitive-${var.environment}"

  tags = {
    Name        = "nestora-${var.environment}-documents-sensitive"
    Environment = var.environment
    Sensitive   = "true"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents_sensitive" {
  bucket = aws_s3_bucket.documents_sensitive.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "documents_sensitive" {
  bucket                  = aws_s3_bucket.documents_sensitive.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
