-- Non-superuser application role: tenant tables use FORCE ROW LEVEL SECURITY, so RLS applies to it.
CREATE ROLE resilisense LOGIN CREATEDB PASSWORD 'resilisense';
CREATE DATABASE resilisense_dev OWNER resilisense;
CREATE DATABASE resilisense_test OWNER resilisense;
