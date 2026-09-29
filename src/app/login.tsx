import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";

const API_URL = "https://gymrat-py89.onrender.com";

export default function LoginScreen() {
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!username.trim() || !password) {
      Alert.alert("Error", "Please enter your username and password.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/token/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: username.trim(),
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        Alert.alert(
          "Login failed",
          "Invalid username or password."
        );
        return;
      }

      await login(
        data.access,
        username.trim()
      );

      router.replace("/(tabs)");
    } catch (error) {
      console.log(error);

      Alert.alert(
        "Connection error",
        "Could not connect to the server."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GYMRAT</Text>

      <Text style={styles.subtitle}>
        Login to your account
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Username"
        placeholderTextColor="#888"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#888"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <Pressable
        style={styles.button}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            Login
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.push("/register")}
      >
        <Text style={styles.registerText}>
          Don't have an account? Register
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 25,
    backgroundColor: "#fff",
  },

  title: {
    fontSize: 36,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 5,
  },

  subtitle: {
    textAlign: "center",
    color: "#666",
    marginBottom: 30,
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
  },

  button: {
    backgroundColor: "#111",
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 5,
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },

  registerText: {
    textAlign: "center",
    marginTop: 20,
    color: "#333",
  },
});