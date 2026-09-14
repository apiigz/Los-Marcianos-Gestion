import {Pool} from "pg";
import "./iniciar.env.mjs"

const pool = new Pool({
    host: process.env.BD_HOST,
    user: process.env.BD_USER,
    password: process.env.BD_PASS,
    database: process.env.BD_BD,
    port: process.env.BD_PORT
})


console.log("Conexión a la base de datos establecida correctamente");
export default pool