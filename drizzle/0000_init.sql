CREATE TABLE "prescriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_user_id" integer NOT NULL,
	"pharmacist_user_id" integer NOT NULL,
	"drug_name" text NOT NULL,
	"indication" text NOT NULL,
	"dosage" text NOT NULL,
	"duration" text NOT NULL,
	"dispensed_on" text,
	"pharmacist_note" text DEFAULT '' NOT NULL,
	"patient_feedback" text DEFAULT '' NOT NULL,
	"side_effects_observed" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_user_id_users_id_fk" FOREIGN KEY ("patient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_pharmacist_user_id_users_id_fk" FOREIGN KEY ("pharmacist_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_prescriptions_patient" ON "prescriptions" USING btree ("patient_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");