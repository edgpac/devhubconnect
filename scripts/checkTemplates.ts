import { db } from '../drizzle/db';
import { users } from '../drizzle/schema';

async function main() {
  const userList = await db.select().from(users).limit(5);
  console.log(userList);
}

main().catch(console.error);
