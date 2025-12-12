import React, { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from "jwt-decode";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Buscar token en la URL (Prioridad 1)
    const params = new URLSearchParams(window.location.search);
    let token = params.get('token');
    
    // 2. Si no está en URL, buscar en LocalStorage (Prioridad 2)
    if (!token) {
        token = localStorage.getItem('sso_token');
    }

    if (token) {
      try {
        // 3. Decodificar el Token Real
        const decoded = jwtDecode(token);
        
        // Verificamos si el token ha expirado
        const currentTime = Date.now() / 1000;
        if (decoded.exp < currentTime) {
            console.warn("⚠️ El token ha expirado. Cerrando sesión.");
            localStorage.removeItem('sso_token');
            setUser(null);
        } else {
            // 4. Crear el usuario con datos REALES del Portal
            console.log("🔍 Token Decodificado:", decoded); // <--- Agregamos esto para ver qué trae

            setUser({
                id: decoded.sub, 
                // Buscamos el email en los campos estándar o en 'user_email'
                email: decoded.email || decoded.user_email || decoded.sub, 
                role: decoded.role || 'authenticated',
                user_metadata: {
                    // Si el token trae nombre, úsalo. Si no, usa el email (cortando antes del @)
                    full_name: decoded.full_name || (decoded.email ? decoded.email.split('@')[0] : 'Usuario'),
                }
            });
            // Guardamos el token válido
            localStorage.setItem('sso_token', token);
        }
      } catch (error) {
        console.error("🚨 Error al decodificar el token:", error);
        localStorage.removeItem('sso_token');
        setUser(null);
      }
    } else {
      setUser(null);
    }
    
    setLoading(false);
  }, []);

  const logout = () => {
    localStorage.removeItem('sso_token');
    setUser(null);
    // Redirigir al login del portal principal
    window.location.href = "https://panel-accesos-somyl-production.up.railway.app";
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};