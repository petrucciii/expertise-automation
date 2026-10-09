import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PasswordHasher } from '@nestjs/authentication';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file located outside /api
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Seeding database...');
    const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password || password.length < 12) {
        throw new Error('Set SEED_ADMIN_PASSWORD to a value of at least 12 characters before seeding');
    }
    const passwordHash = await new PasswordHasher().hash(password);

    // Do not reset an existing account's password every time the seed runs.
    const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
            email,
            passwordHash,
        },
    });

    /* File Cleanup
    const deleteFiles = await prisma.document.deleteMany()
    */

    console.log(`User seeded: ${user.email} (ID: ${user.id})`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
