/* =========================================================
   supabase-config.js
   Configuración de conexión a Supabase.
   Estos valores son públicos, van dentro del código del
   navegador de todas formas — la seguridad real la dan las
   políticas RLS configuradas en supabase-schema.sql.
   ========================================================= */

const SUPABASE_URL = 'https://pltwsbkgtawmxhbrmujg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsdHdzYmtndGF3bXhoYnJtdWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxODg3OTAsImV4cCI6MjEwMDc2NDc5MH0.K06uTOYRZ5ycst8huA0BnunJ3S1SMurPyyAeRmqOlhM';

const awSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
