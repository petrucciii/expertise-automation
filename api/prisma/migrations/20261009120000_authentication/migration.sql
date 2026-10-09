-- Preserve existing password hashes while making their purpose explicit.
ALTER TABLE "User" RENAME COLUMN "password" TO "password_hash";

-- Refresh-token values are opaque and represented in this table only by their
-- SHA-256 identifier. The package records every rotation in the token family.
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "family_expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "claims" JSONB,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE INDEX "refresh_tokens_family_expires_at_idx" ON "refresh_tokens"("family_expires_at");

ALTER TABLE "refresh_tokens"
ADD CONSTRAINT "refresh_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
