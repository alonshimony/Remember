import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY,
  email = process.env.OWNER_EMAIL,
  password = process.env.OWNER_PASSWORD;
if (!url || !key || !email || !password)
  throw new Error(
    "Set database URL, service-role key, OWNER_EMAIL and OWNER_PASSWORD in your local environment",
  );
if (password.length < 12)
  throw new Error("Use a password with at least 12 characters");
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const invitation = await client
  .from("invited_owners")
  .upsert({ email: email.toLowerCase() });
if (invitation.error) throw new Error("Could not add owner allowlist entry");
const result = await client.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (result.error)
  throw new Error(
    "Owner could not be created; check whether the account already exists.",
  );
console.log("Invited owner provisioned. No email was sent.");
