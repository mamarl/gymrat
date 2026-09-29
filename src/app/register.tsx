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

const API_URL = "https://gymrat-py89.onrender.com";

export default function RegisterScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!username.trim() || !password) {
      Alert.alert(
        "Error",
        "Please enter a username and password."
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(
        "Error",
        "Passwords do not match."
      );
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/register/`,
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
          "Registration failed",
          data.error || "Could not create account."
        );
        return;
      }

      Alert.alert(
        "Account created!",
        "You can now log in.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/login"),
          },
        ]
      );
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
      <Text style={styles.title}>Create Account</Text>

      <Text style={styles.subtitle}>
        Start your GYMRAT journey
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

      <TextInput
        style={styles.input}
        placeholder="Confirm password"
        placeholderTextColor="#888"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />

      <Pressable
        style={styles.button}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            Create Account
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.replace("/login")}
      >
        <Text style={styles.loginText}>
          Already have an account? Login
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
    fontSize: 30,
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

  loginText: {
    textAlign: "center",
    marginTop: 20,
    color: "#333",
  },
});