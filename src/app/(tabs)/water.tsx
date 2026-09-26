import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiFetch } from "../../api/api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

const QUICK_ADD = [250, 500, 750];

const ACTIVITY_LEVELS = [
  { key: "sedentary", label: "Sedentary", extra: 0 },
  { key: "light", label: "Light", extra: 250 },
  { key: "moderate", label: "Moderate", extra: 500 },
  { key: "very_active", label: "Very Active", extra: 750 },
] as const;

type ActivityLevel =
  (typeof ACTIVITY_LEVELS)[number]["key"];

type WaterLog = {
  id: number;
  amount_ml: number;
  created_at: string;
  server_id: number | null;
  user_key: string | null;
};

type BackendWaterLog = {
  id: number;
  amount_ml: number;
  created_at: string;
};

type WaterSettings = {
  weight_kg: number;
  activity_level: ActivityLevel;
  custom_goal_ml: number | null;
  taking_creatine: number;
  creatine_grams: number;
};

type HistoricalWaterSnapshot = {
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  goal_ml: number | null;
  taking_creatine: boolean | null;
  creatine_grams: number | null;
};


// --------------------------------------------------
// DATE HELPERS
// --------------------------------------------------

const getToday = () => {
  const date = new Date();

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
};

const formatDateForSql = (date: Date) => {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatDateTimeForSql = (date: Date) => {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    date.getDate()
  ).padStart(2, "0");

  const hours = String(
    date.getHours()
  ).padStart(2, "0");

  const minutes = String(
    date.getMinutes()
  ).padStart(2, "0");

  const seconds = String(
    date.getSeconds()
  ).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const isSameDay = (
  a: Date,
  b: Date
) => {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

const getDateLabel = (date: Date) => {
  const today = getToday();

  if (isSameDay(date, today)) {
    return "Today";
  }

  const yesterday = new Date(today);

  yesterday.setDate(
    yesterday.getDate() - 1
  );

  if (isSameDay(date, yesterday)) {
    return "Yesterday";
  }

  return date.toLocaleDateString(
    undefined,
    {
      weekday: "long",
      month: "long",
      day: "numeric",
    }
  );
};

// --------------------------------------------------
// MAIN
// --------------------------------------------------

export default function Water() {
  const db = useSQLiteContext();
  const { token, userKey } = useAuth();
  const { isDark } = useTheme();

  // --------------------------------------------------
  // THEME COLORS
  // --------------------------------------------------

  const colors = {
    background: isDark ? "#0b0b0c" : "#f5f5f7",

    card: isDark ? "#151517" : "#ffffff",
    secondary: isDark ? "#1c1c1e" : "#ffffff",
    tertiary: isDark ? "#1f1f22" : "#e8e8eb",

    border: isDark ? "#2a2a2c" : "#dedee2",

    primaryText: isDark ? "#fff" : "#111",
    secondaryText: isDark ? "#8a8a8e" : "#666",
    mutedText: isDark ? "#777" : "#888",

    input: isDark ? "#1c1c1e" : "#eeeeF1",

    blue: "#38bdf8",
  };

  const [logs, setLogs] =
    useState<WaterLog[]>([]);

  const [selectedDate, setSelectedDate] =
    useState<Date>(getToday());

  const [weight, setWeight] =
    useState("");

  const [activity, setActivity] =
    useState<ActivityLevel>("moderate");

  const [takingCreatine, setTakingCreatine] =
    useState(false);

  const [creatineGrams, setCreatineGrams] =
    useState("");

  const [customGoal, setCustomGoal] =
    useState("");

  const [customAmount, setCustomAmount] =
    useState("");

  const [showSettings, setShowSettings] =
    useState(false);

  const [selectedDaySnapshot, setSelectedDaySnapshot] =
    useState<HistoricalWaterSnapshot | null>(null);


  // --------------------------------------------------
  // DATE VALUES
  // --------------------------------------------------

  const selectedDateKey = useMemo(
    () =>
      formatDateForSql(
        selectedDate
      ),
    [selectedDate]
  );

  const selectedDateLabel = useMemo(
    () =>
      getDateLabel(
        selectedDate
      ),
    [selectedDate]
  );

  const isToday = isSameDay(
    selectedDate,
    getToday()
  );

  // --------------------------------------------------
  // DOWNLOAD WATER FROM DJANGO
  // --------------------------------------------------

  const syncWaterFromBackend =
    useCallback(
      async () => {
        if (!token || !userKey) {
          console.log(
            "WATER SYNC: No token or user key found"
          );
          return;
        }

        try {
          console.log(
            "WATER SYNC: Downloading water from Django..."
          );

          const backendLogs =
            (await apiFetch(
              "/api/water/",
              {
                method: "GET",
              },
              token
            )) as BackendWaterLog[];

          console.log(
            "WATER SYNC: Django returned",
            backendLogs.length,
            "water log(s)"
          );

          for (const backendLog of backendLogs) {
            const existing =
              await db.getFirstAsync<WaterLog>(
                `
                SELECT
                  id,
                  amount_ml,
                  created_at,
                  server_id,
                  user_key
                FROM water_logs
                WHERE server_id = ?
                  AND user_key = ?
                LIMIT 1
                `,
                backendLog.id,
                userKey
              );

            if (existing) {
              await db.runAsync(
                `
                UPDATE water_logs
                SET
                  amount_ml = ?,
                  created_at = ?
                WHERE id = ?
                  AND user_key = ?
                `,
                backendLog.amount_ml,
                backendLog.created_at,
                existing.id,
                userKey
              );

              continue;
            }

            await db.runAsync(
              `
              INSERT INTO water_logs (
                amount_ml,
                created_at,
                server_id,
                user_key
              )
              VALUES (?, ?, ?, ?)
              `,
              backendLog.amount_ml,
              backendLog.created_at,
              backendLog.id,
              userKey
            );
          }

          console.log(
            "WATER SYNC: Download complete"
          );
        } catch (error) {
          console.log(
            "WATER DOWNLOAD SYNC ERROR:",
            error
          );
        }
      },
      [db, token, userKey]
    );

  // --------------------------------------------------
  // DOWNLOAD WATER SETTINGS FROM DJANGO
  // --------------------------------------------------

  const syncWaterSettingsFromBackend =
    useCallback(
      async () => {
        if (!token || !userKey) {
          console.log(
            "WATER SETTINGS SYNC: No token or user key found"
          );
          return;
        }

        try {
          console.log(
            "WATER SETTINGS SYNC: Downloading from Django..."
          );

          const backendSettings =
            (await apiFetch(
              "/api/water/settings/",
              {
                method: "GET",
              },
              token
            )) as {
              weight_kg: number;
              activity_level: ActivityLevel;
              custom_goal_ml: number | null;
              taking_creatine: boolean;
              creatine_grams: number;
            };

          await db.runAsync(
            `
            UPDATE water_settings
            SET
              weight_kg = ?,
              activity_level = ?,
              custom_goal_ml = ?,
              taking_creatine = ?,
              creatine_grams = ?,
              user_key = ?
            WHERE id = 1
            `,
            backendSettings.weight_kg || 0,
            backendSettings.activity_level ||
              "moderate",
            backendSettings.custom_goal_ml ??
              null,
            backendSettings.taking_creatine
              ? 1
              : 0,
            backendSettings.creatine_grams ||
              0,
            userKey
          );

          console.log(
            "WATER SETTINGS SYNC: Download complete for",
            userKey
          );
        } catch (error) {
          console.log(
            "WATER SETTINGS DOWNLOAD ERROR:",
            error
          );
        }
      },
      [db, token, userKey]
    );

  // --------------------------------------------------
  // LOAD WATER LOGS
  // --------------------------------------------------

  const loadLogs =
    useCallback(
      async () => {
        if (!userKey) {
          setLogs([]);
          return;
        }

        try {
          const rows =
            await db.getAllAsync<WaterLog>(
              `
              SELECT *
              FROM water_logs
              WHERE date(created_at) = ?
                AND user_key = ?
              ORDER BY id DESC
              `,
              selectedDateKey,
              userKey
            );

          setLogs(rows);
        } catch (error) {
          console.log(
            "LOAD WATER LOGS ERROR:",
            error
          );
        }
      },
      [db, selectedDateKey, userKey]
    );

  // --------------------------------------------------
  // LOAD WATER SETTINGS
  // --------------------------------------------------

  const loadSettings =
    useCallback(
      async () => {
        if (!userKey) {
          setWeight("");
          setActivity("moderate");
          setCustomGoal("");
          setTakingCreatine(false);
          setCreatineGrams("");
          return;
        }

        try {
          const row =
            await db.getFirstAsync<WaterSettings>(
              `
              SELECT
                weight_kg,
                activity_level,
                custom_goal_ml,
                taking_creatine,
                creatine_grams
              FROM water_settings
              WHERE id = 1
                AND user_key = ?
              LIMIT 1
              `,
              userKey
            );

          if (!row) {
            // Prevent the previous account's React state
            // from remaining visible.
            setWeight("");
            setActivity("moderate");
            setCustomGoal("");
            setTakingCreatine(false);
            setCreatineGrams("");
            return;
          }

          setWeight(
            row.weight_kg > 0
              ? String(row.weight_kg)
              : ""
          );

          setActivity(
            row.activity_level ||
              "moderate"
          );

          setCustomGoal(
            row.custom_goal_ml
              ? String(row.custom_goal_ml)
              : ""
          );

          setTakingCreatine(
            row.taking_creatine === 1
          );

          setCreatineGrams(
            row.creatine_grams > 0
              ? String(row.creatine_grams)
              : ""
          );
        } catch (error) {
          console.log(
            "LOAD WATER SETTINGS ERROR:",
            error
          );
        }
      },
      [db, userKey]
    );

  // --------------------------------------------------
  // INITIAL LOAD
  // --------------------------------------------------

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // --------------------------------------------------
  // SYNC WHEN WATER SCREEN OPENS / ACCOUNT CHANGES
  // --------------------------------------------------

  useEffect(() => {
    if (!token || !userKey) {
      setLogs([]);
      setWeight("");
      setActivity("moderate");
      setCustomGoal("");
      setTakingCreatine(false);
      setCreatineGrams("");
      return;
    }

    const sync = async () => {
      await syncWaterFromBackend();

      // Backend is the source of truth for the
      // currently logged-in account.
      await syncWaterSettingsFromBackend();

      await loadLogs();
      await loadSettings();
    };

    sync();
  }, [
    token,
    userKey,
    syncWaterFromBackend,
    syncWaterSettingsFromBackend,
    loadLogs,
    loadSettings,
  ]);

  // --------------------------------------------------
  // HISTORICAL WATER SNAPSHOTS
  // --------------------------------------------------

  const loadSnapshotForDate = useCallback(
    async (dateKey: string): Promise<HistoricalWaterSnapshot | null> => {
      if (!userKey) return null;

      if (dateKey === formatDateForSql(getToday())) {
        const current = await db.getFirstAsync<WaterSettings>(
          `SELECT weight_kg, activity_level, custom_goal_ml, taking_creatine, creatine_grams FROM water_settings WHERE id = 1 AND user_key = ? LIMIT 1`,
          userKey
        );
        if (!current) return null;

        const activityExtra = ACTIVITY_LEVELS.find((item) => item.key === current.activity_level)?.extra ?? 500;
        const recommended = current.weight_kg > 0
          ? Math.round((current.weight_kg * 35 + activityExtra + (current.taking_creatine === 1 ? current.creatine_grams * 125 : 0)) / 50) * 50
          : 2500;

        return {
          weight_kg: current.weight_kg || null,
          activity_level: current.activity_level || null,
          goal_ml: current.custom_goal_ml && current.custom_goal_ml > 0 ? current.custom_goal_ml : recommended,
          taking_creatine: current.taking_creatine === 1,
          creatine_grams: current.creatine_grams || 0,
        };
      }

      const endOfDay = `${dateKey} 23:59:59`;
      const weightRow = await db.getFirstAsync<{ weight_kg: number }>(
        `SELECT weight_kg FROM weight_history WHERE user_key = ? AND created_at <= ? ORDER BY created_at DESC, id DESC LIMIT 1`, userKey, endOfDay
      );
      const activityRow = await db.getFirstAsync<{ activity_level: ActivityLevel }>(
        `SELECT activity_level FROM activity_history WHERE user_key = ? AND created_at <= ? ORDER BY created_at DESC, id DESC LIMIT 1`, userKey, endOfDay
      );
      const goalRow = await db.getFirstAsync<{ goal_ml: number }>(
        `SELECT goal_ml FROM water_goal_history WHERE user_key = ? AND created_at <= ? ORDER BY created_at DESC, id DESC LIMIT 1`, userKey, endOfDay
      );
      const creatineRow = await db.getFirstAsync<{ taking_creatine: number; creatine_grams: number }>(
        `SELECT taking_creatine, creatine_grams FROM creatine_history WHERE user_key = ? AND created_at <= ? ORDER BY created_at DESC, id DESC LIMIT 1`, userKey, endOfDay
      );

      let goal = goalRow?.goal_ml ?? null;
      if (goal === null && weightRow && activityRow && creatineRow) {
        const activityExtra = ACTIVITY_LEVELS.find((item) => item.key === activityRow.activity_level)?.extra ?? 500;
        goal = Math.round((weightRow.weight_kg * 35 + activityExtra + (creatineRow.taking_creatine === 1 ? creatineRow.creatine_grams * 125 : 0)) / 50) * 50;
      }

      if (!weightRow && !activityRow && !goalRow && !creatineRow) return null;

      return {
        weight_kg: weightRow?.weight_kg ?? null,
        activity_level: activityRow?.activity_level ?? null,
        goal_ml: goal,
        taking_creatine: creatineRow ? creatineRow.taking_creatine === 1 : null,
        creatine_grams: creatineRow?.creatine_grams ?? null,
      };
    },
    [db, userKey]
  );

  useEffect(() => {
    const loadSelectedSnapshot = async () => {
      const snapshot = await loadSnapshotForDate(selectedDateKey);
      setSelectedDaySnapshot(snapshot);
    };
    loadSelectedSnapshot();
  }, [selectedDateKey, loadSnapshotForDate]);

  // --------------------------------------------------
  // DATE NAVIGATION
  // --------------------------------------------------

  const goToPreviousDay = () => {
    setSelectedDate(
      (current) => {
        const next =
          new Date(current);

        next.setDate(
          next.getDate() - 1
        );

        return next;
      }
    );
  };

  const goToNextDay = () => {
    setSelectedDate(
      (current) => {
        const next =
          new Date(current);

        next.setDate(
          next.getDate() + 1
        );

        if (next > getToday()) {
          return current;
        }

        return next;
      }
    );
  };

  const goToToday = () => {
    setSelectedDate(
      getToday()
    );
  };

  // --------------------------------------------------
  // SWIPE
  // --------------------------------------------------

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (
          _,
          gesture
        ) => {
          return (
            Math.abs(gesture.dx) >
              Math.abs(gesture.dy) &&
            Math.abs(gesture.dx) > 20
          );
        },

        onPanResponderRelease: (
          _,
          gesture
        ) => {
          const SWIPE_THRESHOLD = 60;

          if (
            gesture.dx <
            -SWIPE_THRESHOLD
          ) {
            goToNextDay();
          } else if (
            gesture.dx >
            SWIPE_THRESHOLD
          ) {
            goToPreviousDay();
          }
        },
      }),
    [selectedDate]
  );

  // --------------------------------------------------
  // SAVE SETTINGS
  // --------------------------------------------------

  const saveSettings = async () => {
    if (!userKey) {
      Alert.alert(
        "Not logged in",
        "Please log in again."
      );
      return;
    }

    const weightValue =
      parseFloat(weight) || 0;

    const creatineValue =
      parseFloat(creatineGrams) || 0;

    const customGoalValue =
      parseInt(
        customGoal,
        10
      );

    if (weightValue <= 0) {
      Alert.alert(
        "Invalid weight",
        "Please enter your body weight in kg."
      );

      return;
    }

    if (
      takingCreatine &&
      creatineValue <= 0
    ) {
      Alert.alert(
        "Invalid creatine amount",
        "Please enter your daily creatine amount in grams."
      );

      return;
    }

    if (
      customGoal.trim() !== "" &&
      customGoalValue <= 0
    ) {
      Alert.alert(
        "Invalid water goal",
        "Please enter a valid custom goal in ml."
      );

      return;
    }

    try {
      const currentSettings =
        await db.getFirstAsync<{
          weight_kg: number;
          activity_level: ActivityLevel;
          custom_goal_ml: number | null;
          taking_creatine: number;
          creatine_grams: number;
        }>(
          `
          SELECT
            weight_kg,
            activity_level,
            custom_goal_ml,
            taking_creatine,
            creatine_grams
          FROM water_settings
          WHERE id = 1
            AND user_key = ?
          LIMIT 1
          `,
          userKey
        );

      const previousWeight =
        currentSettings?.weight_kg ??
        0;

      const previousActivity =
        currentSettings?.activity_level ??
        "moderate";

      const previousCustomGoal =
        currentSettings?.custom_goal_ml ??
        null;

      const previousTakingCreatine =
        currentSettings?.taking_creatine ===
        1;

      const previousCreatineGrams =
        currentSettings?.creatine_grams ??
        0;

      const previousActivityExtra =
        ACTIVITY_LEVELS.find(
          (item) =>
            item.key ===
            previousActivity
        )?.extra ?? 500;

      const previousBaseWater =
        previousWeight * 35;

      const previousCreatineWater =
        previousTakingCreatine
          ? previousCreatineGrams *
            125
          : 0;

      const previousRecommendedGoal =
        previousWeight > 0
          ? Math.round(
              (
                previousBaseWater +
                previousCreatineWater +
                previousActivityExtra
              ) / 50
            ) * 50
          : 2500;

      const previousDailyGoal =
        previousCustomGoal !==
          null &&
        previousCustomGoal > 0
          ? previousCustomGoal
          : previousRecommendedGoal;

      const newActivityExtra =
        ACTIVITY_LEVELS.find(
          (item) =>
            item.key === activity
        )?.extra ?? 500;

      const newBaseWater =
        weightValue * 35;

      const newCreatineWater =
        takingCreatine
          ? creatineValue * 125
          : 0;

      const newRecommendedGoal =
        weightValue > 0
          ? Math.round(
              (
                newBaseWater +
                newCreatineWater +
                newActivityExtra
              ) / 50
            ) * 50
          : 2500;

      const newDailyGoal =
        customGoalValue > 0
          ? customGoalValue
          : newRecommendedGoal;

      const now =
        formatDateTimeForSql(
          new Date()
        );

      // -----------------------------------------------
      // SAVE CURRENT ACCOUNT'S LOCAL SETTINGS
      // -----------------------------------------------

      await db.runAsync(
        `
        UPDATE water_settings
        SET
          weight_kg = ?,
          activity_level = ?,
          custom_goal_ml = ?,
          taking_creatine = ?,
          creatine_grams = ?,
          user_key = ?
        WHERE id = 1
        `,
        weightValue,
        activity,
        customGoalValue > 0
          ? customGoalValue
          : null,
        takingCreatine ? 1 : 0,
        takingCreatine
          ? creatineValue
          : 0,
        userKey
      );

      // -----------------------------------------------
      // WEIGHT HISTORY
      // -----------------------------------------------

      if (
        previousWeight !==
        weightValue
      ) {
        await db.runAsync(
          `
          INSERT INTO weight_history (
            weight_kg,
            created_at,
            user_key
          )
          VALUES (?, ?, ?)
          `,
          weightValue,
          now,
          userKey
        );

        console.log(
          "WEIGHT HISTORY: Saved",
          weightValue,
          "kg for",
          userKey
        );
      }

      // -----------------------------------------------
      // ACTIVITY HISTORY
      // -----------------------------------------------

      if (
        previousActivity !==
        activity
      ) {
        await db.runAsync(
          `
          INSERT INTO activity_history (
            activity_level,
            created_at,
            user_key
          )
          VALUES (?, ?, ?)
          `,
          activity,
          now,
          userKey
        );

        console.log(
          "ACTIVITY HISTORY: Saved",
          activity,
          "for",
          userKey
        );
      }

      // -----------------------------------------------
      // WATER GOAL HISTORY
      // -----------------------------------------------

      if (
        previousDailyGoal !==
        newDailyGoal
      ) {
        await db.runAsync(
          `
          INSERT INTO water_goal_history (
            goal_ml,
            created_at,
            user_key
          )
          VALUES (?, ?, ?)
          `,
          newDailyGoal,
          now,
          userKey
        );

        console.log(
          "WATER GOAL HISTORY: Saved",
          newDailyGoal,
          "ml for",
          userKey
        );
      }

      // -----------------------------------------------
      // CREATINE HISTORY
      // -----------------------------------------------

      const newCreatineGrams =
        takingCreatine
          ? creatineValue
          : 0;

      if (
        previousTakingCreatine !==
          takingCreatine ||
        previousCreatineGrams !==
        newCreatineGrams
      ) {
        await db.runAsync(
          `
          INSERT INTO creatine_history (
            taking_creatine,
            creatine_grams,
            created_at,
            user_key
          )
          VALUES (?, ?, ?, ?)
          `,
          takingCreatine
            ? 1
            : 0,
          newCreatineGrams,
          now,
          userKey
        );

        console.log(
          "CREATINE HISTORY: Saved",
          takingCreatine,
          newCreatineGrams,
          "g for",
          userKey
        );
      }

      // -----------------------------------------------
      // UPLOAD TO DJANGO
      // -----------------------------------------------

      if (token) {
        try {
          const backendSettings =
            await apiFetch(
              "/api/water/settings/",
              {
                method: "POST",
                body: JSON.stringify({
                  weight_kg:
                    weightValue,
                  activity_level:
                    activity,
                  custom_goal_ml:
                    customGoalValue >
                    0
                      ? customGoalValue
                      : null,
                  taking_creatine:
                    takingCreatine,
                  creatine_grams:
                    takingCreatine
                      ? creatineValue
                      : 0,
                }),
              },
              token
            );

          console.log(
            "BACKEND WATER SETTINGS UPDATED:",
            backendSettings
          );
        } catch (error) {
          console.log(
            "WATER SETTINGS BACKEND SYNC ERROR:",
            error
          );

          Alert.alert(
            "Saved locally",
            "Your settings were saved on this device, but could not be uploaded to Django."
          );
        }
      }

      await loadSettings();

      setShowSettings(
        false
      );

      Alert.alert(
        "Saved",
        "Your water settings have been updated."
      );
    } catch (error) {
      console.log(
        "SAVE WATER SETTINGS ERROR:",
        error
      );

      Alert.alert(
        "Error",
        "Could not save water settings."
      );
    }
  };

  // --------------------------------------------------
  // USE RECOMMENDED GOAL
  // --------------------------------------------------

  const useRecommendedGoal =
    async () => {
      if (!userKey) {
        return;
      }

      try {
        const currentSettings =
          await db.getFirstAsync<{
            weight_kg: number;
            activity_level: ActivityLevel;
            custom_goal_ml: number | null;
            taking_creatine: number;
            creatine_grams: number;
          }>(
            `
            SELECT
              weight_kg,
              activity_level,
              custom_goal_ml,
              taking_creatine,
              creatine_grams
            FROM water_settings
            WHERE id = 1
              AND user_key = ?
            LIMIT 1
            `,
            userKey
          );

        if (!currentSettings) {
          return;
        }

        const previousActivityExtra =
          ACTIVITY_LEVELS.find(
            (item) =>
              item.key ===
              currentSettings.activity_level
          )?.extra ?? 500;

        const previousBaseWater =
          currentSettings.weight_kg *
          35;

        const previousCreatineWater =
          currentSettings.taking_creatine ===
          1
            ? currentSettings.creatine_grams *
              125
            : 0;

        const previousRecommendedGoal =
          currentSettings.weight_kg >
          0
            ? Math.round(
                (
                  previousBaseWater +
                  previousCreatineWater +
                  previousActivityExtra
                ) / 50
              ) * 50
            : 2500;

        const previousDailyGoal =
          currentSettings.custom_goal_ml !==
            null &&
          currentSettings.custom_goal_ml >
            0
            ? currentSettings.custom_goal_ml
            : previousRecommendedGoal;

        await db.runAsync(
          `
          UPDATE water_settings
          SET
            custom_goal_ml = NULL,
            user_key = ?
          WHERE id = 1
          `,
          userKey
        );

        setCustomGoal("");

        if (
          previousDailyGoal !==
          previousRecommendedGoal
        ) {
          await db.runAsync(
            `
            INSERT INTO water_goal_history (
              goal_ml,
              created_at,
              user_key
            )
            VALUES (?, ?, ?)
            `,
            previousRecommendedGoal,
            formatDateTimeForSql(
              new Date()
            ),
            userKey
          );

          console.log(
            "WATER GOAL HISTORY: Recommended goal saved",
            previousRecommendedGoal,
            "ml for",
            userKey
          );
        }

        if (token) {
          try {
            await apiFetch(
              "/api/water/settings/",
              {
                method: "POST",
                body: JSON.stringify({
                  custom_goal_ml:
                    null,
                }),
              },
              token
            );

            console.log(
              "WATER SETTINGS BACKEND: Recommended goal restored"
            );
          } catch (error) {
            console.log(
              "WATER RECOMMENDED GOAL BACKEND ERROR:",
              error
            );
          }
        }

        await loadSettings();
  
        Alert.alert(
          "Recommended goal",
          "Your recommended water goal is now active."
        );
      } catch (error) {
        console.log(
          "RECOMMENDED GOAL ERROR:",
          error
        );
      }
    };

  // --------------------------------------------------
  // CALCULATE WATER GOAL
  // --------------------------------------------------

  const activityExtra =
    ACTIVITY_LEVELS.find(
      (item) =>
        item.key === activity
    )?.extra ?? 500;

  const weightValue =
    parseFloat(weight) || 0;

  const creatineValue =
    parseFloat(
      creatineGrams
    ) || 0;

  const baseWater =
    weightValue * 35;

  const creatineWater =
    takingCreatine
      ? creatineValue * 125
      : 0;

  const recommendedGoal =
    weightValue > 0
      ? Math.round(
          (
            baseWater +
            creatineWater +
            activityExtra
          ) / 50
        ) * 50
      : 2500;

  const customGoalValue =
    parseInt(
      customGoal,
      10
    );

  const currentDailyGoal =
    customGoalValue > 0
      ? customGoalValue
      : recommendedGoal;

  const dailyGoal =
    !isToday && selectedDaySnapshot?.goal_ml
      ? selectedDaySnapshot.goal_ml
      : currentDailyGoal;

  // --------------------------------------------------
  // SELECTED DAY TOTAL
  // --------------------------------------------------

  const total =
    logs.reduce(
      (sum, log) =>
        sum + log.amount_ml,
      0
    );

  const pct =
    dailyGoal > 0
      ? Math.min(
          100,
          Math.round(
            (total /
              dailyGoal) *
              100
          )
        )
      : 0;

  // --------------------------------------------------
  // ADD WATER
  // --------------------------------------------------

  const addWater = async (
    ml: number
  ) => {
    if (
      isNaN(ml) ||
      ml <= 0 ||
      !userKey
    ) {
      return;
    }

    try {
      const now =
        new Date();

      const selectedDateTime =
        new Date(
          selectedDate
        );

      selectedDateTime.setHours(
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
        0
      );

      const createdAt =
        formatDateTimeForSql(
          selectedDateTime
        );

      const result =
        await db.runAsync(
          `
          INSERT INTO water_logs (
            amount_ml,
            created_at,
            server_id,
            user_key
          )
          VALUES (?, ?, ?, ?)
          `,
          ml,
          createdAt,
          null,
          userKey
        );

      const localId =
        result.lastInsertRowId;

      console.log(
        "LOCAL WATER SAVED:",
        localId,
        ml,
        "ml for",
        userKey
      );

      if (token) {
        try {
          console.log(
            "WATER SYNC: Uploading water to Django..."
          );

          const backendLog =
            (await apiFetch(
              "/api/water/",
              {
                method: "POST",
                body: JSON.stringify({
                  amount_ml:
                    ml,
                  created_at:
                    createdAt,
                }),
              },
              token
            )) as BackendWaterLog;

          await db.runAsync(
            `
            UPDATE water_logs
            SET server_id = ?
            WHERE id = ?
              AND user_key = ?
            `,
            backendLog.id,
            localId,
            userKey
          );

          console.log(
            "WATER SYNC COMPLETE:",
            backendLog.id
          );
        } catch (error) {
          console.log(
            "WATER UPLOAD SYNC ERROR:",
            error
          );

          console.log(
            "WATER REMAINS SAVED LOCALLY:",
            localId
          );
        }
      }

      await loadLogs();
    } catch (error) {
      console.log(
        "ADD WATER ERROR:",
        error
      );

      Alert.alert(
        "Error",
        "Could not add water."
      );
    }
  };

  // --------------------------------------------------
  // DELETE WATER LOG
  // --------------------------------------------------

  const removeLog = async (
    id: number
  ) => {
    if (!userKey) {
      return;
    }

    Alert.alert(
      "Delete water log?",
      "Are you sure you want to delete this entry?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress:
            async () => {
              try {
                const log =
                  await db.getFirstAsync<{
                    server_id:
                      | number
                      | null;
                  }>(
                    `
                    SELECT server_id
                    FROM water_logs
                    WHERE id = ?
                      AND user_key = ?
                    `,
                    id,
                    userKey
                  );

                if (
                  token &&
                  log?.server_id
                ) {
                  await apiFetch(
                    `/api/water/${log.server_id}/`,
                    {
                      method:
                        "DELETE",
                    },
                    token
                  );
                }

                await db.runAsync(
                  `
                  DELETE FROM water_logs
                  WHERE id = ?
                    AND user_key = ?
                  `,
                  id,
                  userKey
                );

                await loadLogs();
              } catch (error) {
                console.log(
                  "DELETE WATER LOG ERROR:",
                  error
                );
              }
            },
        },
      ]
    );
  };

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor:
            colors.background,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={{
          paddingBottom: 120,
        }}
      >
        <Text
          style={[
            styles.title,
            {
              color:
                colors.primaryText,
            },
          ]}
        >
          Water Intake
        </Text>

        <Text
          style={[
            styles.subtitle,
            {
              color:
                colors.secondaryText,
            },
          ]}
        >
          Track your daily hydration
        </Text>

        {/* DATE NAVIGATION */}

        <View
          style={[
            styles.dateNavigation,
            {
              backgroundColor:
                colors.card,
              borderColor:
                colors.border,
            },
          ]}
        >
          <Pressable
            style={[
              styles.dateArrow,
              {
                backgroundColor:
                  colors.tertiary,
              },
            ]}
            onPress={
              goToPreviousDay
            }
          >
            <Text
              style={[
                styles.arrowText,
                {
                  color:
                    colors.blue,
                },
              ]}
            >
              ‹
            </Text>
          </Pressable>

          <View
            style={
              styles.dateCenter
            }
          >
            <Text
              style={[
                styles.dateLabel,
                {
                  color:
                    colors.primaryText,
                },
              ]}
            >
              {selectedDateLabel}
            </Text>

            {!isToday && (
              <Text
                style={[
                  styles.dateSubtext,
                  {
                    color:
                      colors.mutedText,
                  },
                ]}
              >
                Swipe left or right to change day
              </Text>
            )}
          </View>

          <Pressable
            style={[
              styles.dateArrow,
              {
                backgroundColor:
                  colors.tertiary,
              },
              isToday &&
                styles.disabledArrow,
            ]}
            onPress={
              goToNextDay
            }
            disabled={
              isToday
            }
          >
            <Text
              style={[
                styles.arrowText,
                {
                  color:
                    colors.blue,
                },
                isToday &&
                  styles.disabledArrowText,
              ]}
            >
              ›
            </Text>
          </Pressable>
        </View>

        {!isToday && (
          <Pressable
            style={[
              styles.todayButton,
              {
                backgroundColor:
                  colors.secondary,
              },
            ]}
            onPress={
              goToToday
            }
          >
            <Text
              style={[
                styles.todayButtonText,
                {
                  color:
                    colors.blue,
                },
              ]}
            >
              Go to Today
            </Text>
          </Pressable>
        )}

        {/* TOTAL */}

        <View
          style={[
            styles.totalCard,
            {
              backgroundColor:
                colors.card,
            },
          ]}
        >
          <Text
            style={[
              styles.total,
              {
                color:
                  colors.primaryText,
              },
            ]}
          >
            {total}{" "}
            <Text
              style={[
                styles.goal,
                {
                  color:
                    colors.secondaryText,
                },
              ]}
            >
              / {dailyGoal} ml
            </Text>
          </Text>

          <View
            style={[
              styles.track,
              {
                backgroundColor:
                  colors.tertiary,
              },
            ]}
          >
            <View
              style={[
                styles.fill,
                {
                  width:
                    `${pct}%`,
                  backgroundColor:
                    colors.blue,
                },
              ]}
            />
          </View>

          <Text
            style={[
              styles.pct,
              {
                color:
                  colors.secondaryText,
              },
            ]}
          >
            {pct}% of{" "}
            {isToday
              ? "today's"
              : "this day's"}{" "}
            goal
          </Text>
        </View>

        {/* RECOMMENDED GOAL */}

        <View
          style={[
            styles.goalCard,
            {
              backgroundColor:
                colors.card,
            },
          ]}
        >
          <Text
            style={[
              styles.cardTitle,
              {
                color:
                  colors.primaryText,
              },
            ]}
          >
            Recommended Daily Goal
          </Text>

          <Text
            style={[
              styles.goalNumber,
              {
                color:
                  colors.blue,
              },
            ]}
          >
            {recommendedGoal} ml
          </Text>

          <Text
            style={[
              styles.cardDescription,
              {
                color:
                  colors.secondaryText,
              },
            ]}
          >
            Based on 35 ml/kg body weight
            {takingCreatine
              ? " + creatine"
              : ""}
            {" + "}
            {activity.toLowerCase()}{" "}
            activity.
          </Text>

          {takingCreatine && (
            <Text
              style={[
                styles.creatineInfo,
                {
                  color:
                    colors.secondaryText,
                },
              ]}
            >
              Creatine adds approximately{" "}
              {Math.round(
                creatineWater
              )}{" "}
              ml based on{" "}
              {creatineValue} g/day.
            </Text>
          )}
        </View>

        {/* SETTINGS BUTTON */}

        <Pressable
          style={[
            styles.settingsButton,
            {
              backgroundColor:
                colors.secondary,
            },
          ]}
          onPress={() =>
            setShowSettings(
              !showSettings
            )
          }
        >
          <Text
            style={[
              styles.settingsButtonText,
              {
                color:
                  colors.primaryText,
              },
            ]}
          >
            {showSettings
              ? "Hide Water Settings"
              : "Water Settings"}
          </Text>

          <Text
            style={[
              styles.settingsArrow,
              {
                color:
                  colors.blue,
              },
            ]}
          >
            {showSettings
              ? "▲"
              : "▼"}
          </Text>
        </Pressable>

        {/* SETTINGS */}

        {showSettings && (
          <View
            style={[
              styles.settingsCard,
              {
                backgroundColor:
                  colors.card,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color:
                    colors.primaryText,
                },
              ]}
            >
              Body Weight (kg)
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor:
                    colors.input,
                  color:
                    colors.primaryText,
                },
              ]}
              placeholder="e.g. 70"
              placeholderTextColor={
                colors.mutedText
              }
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={
                setWeight
              }
            />

            <Text
              style={[
                styles.label,
                {
                  color:
                    colors.primaryText,
                },
              ]}
            >
              Activity Level
            </Text>

            <View
              style={
                styles.activityGrid
              }
            >
              {ACTIVITY_LEVELS.map(
                (item) => {
                  const selected =
                    activity ===
                    item.key;

                  return (
                    <Pressable
                      key={
                        item.key
                      }
                      style={[
                        styles.activityButton,
                        {
                          backgroundColor:
                            colors.secondary,
                        },
                        selected && {
                          backgroundColor:
                            colors.blue,
                        },
                      ]}
                      onPress={() =>
                        setActivity(
                          item.key
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.activityText,
                          {
                            color:
                              colors.primaryText,
                          },
                          selected &&
                            styles.activitySelectedText,
                        ]}
                      >
                        {item.label}
                      </Text>

                      <Text
                        style={[
                          styles.activityExtra,
                          {
                            color:
                              colors.secondaryText,
                          },
                          selected &&
                            styles.activitySelectedText,
                        ]}
                      >
                        +{item.extra} ml
                      </Text>
                    </Pressable>
                  );
                }
              )}
            </View>

            <View
              style={
                styles.switchRow
              }
            >
              <View
                style={{
                  flex: 1,
                }}
              >
                <Text
                  style={[
                    styles.label,
                    {
                      color:
                        colors.primaryText,
                    },
                  ]}
                >
                  Taking Creatine?
                </Text>

                <Text
                  style={[
                    styles.switchDescription,
                    {
                      color:
                        colors.mutedText,
                    },
                  ]}
                >
                  Adds water to the estimate
                  based on daily creatine.
                </Text>
              </View>

              <Switch
                value={
                  takingCreatine
                }
                onValueChange={
                  setTakingCreatine
                }
                trackColor={{
                  false: isDark
                    ? "#333"
                    : "#ccc",
                  true: colors.blue,
                }}
                thumbColor="#fff"
              />
            </View>

            {takingCreatine && (
              <>
                <Text
                  style={[
                    styles.label,
                    {
                      color:
                        colors.primaryText,
                    },
                  ]}
                >
                  Daily Creatine (g)
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor:
                        colors.input,
                      color:
                        colors.primaryText,
                    },
                  ]}
                  placeholder="e.g. 5"
                  placeholderTextColor={
                    colors.mutedText
                  }
                  keyboardType="decimal-pad"
                  value={
                    creatineGrams
                  }
                  onChangeText={
                    setCreatineGrams
                  }
                />

                <Text
                  style={[
                    styles.calculationText,
                    {
                      color:
                        colors.secondaryText,
                    },
                  ]}
                >
                  {creatineValue} g ×
                  125 ml ={" "}
                  {Math.round(
                    creatineWater
                  )}{" "}
                  ml extra
                </Text>
              </>
            )}

            <Text
              style={[
                styles.label,
                {
                  color:
                    colors.primaryText,
                },
              ]}
            >
              Custom Daily Goal (ml)
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor:
                    colors.input,
                  color:
                    colors.primaryText,
                },
              ]}
              placeholder="Leave empty to use recommended"
              placeholderTextColor={
                colors.mutedText
              }
              keyboardType="number-pad"
              value={
                customGoal
              }
              onChangeText={
                setCustomGoal
              }
            />

            <Text
              style={[
                styles.calculationText,
                {
                  color:
                    colors.secondaryText,
                },
              ]}
            >
              {customGoalValue >
              0
                ? `Using custom goal: ${customGoalValue} ml`
                : `Using recommended goal: ${recommendedGoal} ml`}
            </Text>

            <Pressable
              style={[
                styles.saveButton,
                {
                  backgroundColor:
                    colors.blue,
                },
              ]}
              onPress={
                saveSettings
              }
            >
              <Text
                style={
                  styles.saveText
                }
              >
                Save Settings
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.recommendedButton,
                {
                  backgroundColor:
                    colors.secondary,
                },
              ]}
              onPress={
                useRecommendedGoal
              }
            >
              <Text
                style={[
                  styles.recommendedText,
                  {
                    color:
                      colors.blue,
                  },
                ]}
              >
                Use Recommended Goal
              </Text>
            </Pressable>
          </View>
        )}

        {/* ADD WATER */}

        <Text
          style={[
            styles.section,
            {
              color:
                colors.secondaryText,
            },
          ]}
        >
          Add Water
        </Text>

        <View
          style={styles.row}
        >
          {QUICK_ADD.map(
            (ml) => (
              <Pressable
                key={ml}
                style={[
                  styles.quick,
                  {
                    backgroundColor:
                      colors.secondary,
                  },
                ]}
                onPress={() =>
                  addWater(
                    ml
                  )
                }
              >
                <Text
                  style={[
                    styles.quickText,
                    {
                      color:
                        colors.blue,
                    },
                  ]}
                >
                  +{ml}
                </Text>

                <Text
                  style={[
                    styles.quickUnit,
                    {
                      color:
                        colors.mutedText,
                    },
                  ]}
                >
                  ml
                </Text>
              </Pressable>
            )
          )}
        </View>

        {/* CUSTOM AMOUNT */}

        <View
          style={styles.row}
        >
          <TextInput
            style={[
              styles.input,
              {
                flex: 1,
                backgroundColor:
                  colors.input,
                color:
                  colors.primaryText,
              },
            ]}
            placeholder="Custom amount (ml)"
            placeholderTextColor={
              colors.mutedText
            }
            keyboardType="number-pad"
            value={
              customAmount
            }
            onChangeText={
              setCustomAmount
            }
          />

          <Pressable
            style={[
              styles.addBtn,
              {
                backgroundColor:
                  colors.blue,
              },
            ]}
            onPress={
              async () => {
                const amount =
                  parseInt(
                    customAmount,
                    10
                  );

                if (
                  isNaN(
                    amount
                  ) ||
                  amount <= 0
                ) {
                  Alert.alert(
                    "Invalid amount",
                    "Please enter a valid water amount."
                  );

                  return;
                }

                await addWater(
                  amount
                );

                setCustomAmount(
                  ""
                );
              }
            }
          >
            <Text
              style={
                styles.addText
              }
            >
              Add
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={[
            styles.historyButton,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
          onPress={() => router.push("/water-history")}
        >
          <View>
            <Text
              style={[
                styles.historyButtonTitle,
                { color: colors.primaryText },
              ]}
            >
              Water History
            </Text>
            <Text
              style={[
                styles.historyButtonSubtitle,
                { color: colors.secondaryText },
              ]}
            >
              View your previous water intake and daily goals
            </Text>
          </View>

          <Text
            style={[
              styles.historyButtonArrow,
              { color: colors.blue },
            ]}
          >
            ›
          </Text>
        </Pressable>

        {/* WATER LOG */}

        <View
          style={
            styles.logHeader
          }
        >
          <Text
            style={[
              styles.section,
              {
                color:
                  colors.secondaryText,
              },
            ]}
          >
            {isToday
              ? "Today's Water"
              : `${selectedDateLabel}'s Water`}
          </Text>

          <Text
            style={[
              styles.logHint,
              {
                color:
                  colors.mutedText,
              },
            ]}
          >
            Long-press to delete
          </Text>
        </View>

        {logs.length ===
        0 ? (
          <Text
            style={[
              styles.empty,
              {
                color:
                  colors.secondaryText,
              },
            ]}
          >
            No water logged for this day.
          </Text>
        ) : (
          <FlatList
            data={logs}
            keyExtractor={(
              item
            ) =>
              String(
                item.id
              )
            }
            scrollEnabled={
              false
            }
            renderItem={({
              item,
            }) => (
              <Pressable
                style={[
                  styles.item,
                  {
                    backgroundColor:
                      colors.secondary,
                  },
                ]}
                onLongPress={() =>
                  removeLog(
                    item.id
                  )
                }
              >
                <Text
                  style={[
                    styles.itemAmount,
                    {
                      color:
                        colors.primaryText,
                    },
                  ]}
                >
                  {
                    item.amount_ml
                  }{" "}
                  ml
                </Text>

                <Text
                  style={[
                    styles.itemTime,
                    {
                      color:
                        colors.secondaryText,
                    },
                  ]}
                >
                  {item.created_at.slice(
                    11,
                    16
                  )}
                </Text>
              </Pressable>
            )}
          />
        )}
      </ScrollView>
    </View>
  );
}

// --------------------------------------------------
// STYLES
// --------------------------------------------------

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
    },

    title: {
      fontSize: 30,
      fontWeight: "800",
      marginTop: 8,
    },

    subtitle: {
      fontSize: 14,
      marginTop: 4,
      marginBottom: 18,
    },

    dateNavigation: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      borderRadius: 14,
      borderWidth: 1,
      padding: 8,
      marginBottom: 10,
    },

    dateArrow: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    arrowText: {
      fontSize: 32,
      lineHeight: 34,
      fontWeight: "300",
    },

    disabledArrow: {
      opacity: 0.4,
    },

    disabledArrowText: {
      color: "#666",
    },

    dateCenter: {
      flex: 1,
      alignItems:
        "center",
      paddingHorizontal: 10,
    },

    dateLabel: {
      fontSize: 17,
      fontWeight: "700",
      textAlign:
        "center",
    },

    dateSubtext: {
      fontSize: 11,
      marginTop: 3,
      textAlign:
        "center",
    },

    todayButton: {
      alignSelf:
        "center",
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderRadius: 10,
      marginBottom: 12,
    },

    todayButtonText: {
      fontWeight: "700",
    },

    totalCard: {
      padding: 16,
      borderRadius: 16,
      marginBottom: 12,
    },

    total: {
      fontSize: 40,
      fontWeight: "800",
    },

    goal: {
      fontSize: 18,
      fontWeight: "500",
    },

    track: {
      height: 14,
      borderRadius: 7,
      marginTop: 12,
      overflow:
        "hidden",
    },

    fill: {
      height: "100%",
      borderRadius: 7,
    },

    pct: {
      marginTop: 6,
    },

    goalCard: {
      padding: 16,
      borderRadius: 14,
      marginBottom: 12,
    },

    cardTitle: {
      fontSize: 16,
      fontWeight: "700",
    },

    goalNumber: {
      fontSize: 28,
      fontWeight: "800",
      marginTop: 6,
    },

    cardDescription: {
      fontSize: 13,
      lineHeight: 19,
      marginTop: 5,
    },

    creatineInfo: {
      fontSize: 12,
      marginTop: 8,
    },

    settingsButton: {
      borderRadius: 12,
      padding: 15,
      flexDirection:
        "row",
      justifyContent:
        "space-between",
      alignItems:
        "center",
      marginBottom: 12,
    },

    settingsButtonText: {
      fontWeight: "700",
      fontSize: 15,
    },

    settingsArrow: {
      fontSize: 14,
    },

    settingsCard: {
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
    },

    label: {
      fontSize: 14,
      fontWeight: "700",
      marginBottom: 8,
      marginTop: 4,
    },

    input: {
      padding: 12,
      borderRadius: 12,
      fontSize: 16,
      marginBottom: 14,
    },

    activityGrid: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap: 8,
      marginBottom: 12,
    },

    activityButton: {
      width: "48%",
      paddingVertical: 12,
      borderRadius: 10,
      alignItems:
        "center",
    },

    activityText: {
      fontWeight: "700",
      fontSize: 13,
    },

    activityExtra: {
      fontSize: 11,
      marginTop: 3,
    },

    activitySelectedText: {
      color: "#000",
    },

    switchRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      marginTop: 8,
      marginBottom: 10,
    },

    switchDescription: {
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
      paddingRight: 12,
    },

    calculationText: {
      fontSize: 12,
      marginTop: -7,
      marginBottom: 14,
    },

    saveButton: {
      paddingVertical: 13,
      borderRadius: 11,
      alignItems:
        "center",
      marginTop: 4,
    },

    saveText: {
      color: "#000",
      fontWeight: "800",
      fontSize: 15,
    },

    recommendedButton: {
      paddingVertical: 13,
      borderRadius: 11,
      alignItems:
        "center",
      marginTop: 8,
    },

    recommendedText: {
      fontWeight: "700",
      fontSize: 14,
    },

    section: {
      marginTop: 8,
      marginBottom: 8,
      fontSize: 14,
      fontWeight: "600",
    },

    row: {
      flexDirection:
        "row",
      gap: 10,
      marginBottom: 12,
    },

    quick: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems:
        "center",
    },

    quickText: {
      fontWeight: "700",
      fontSize: 16,
    },

    quickUnit: {
      fontSize: 10,
      marginTop: 2,
    },

    addBtn: {
      paddingHorizontal: 20,
      borderRadius: 12,
      justifyContent:
        "center",
    },

    addText: {
      color: "#000",
      fontWeight: "700",
    },

    logHeader: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      marginTop: 4,
    },

    logHint: {
      fontSize: 11,
    },

    item: {
      padding: 13,
      borderRadius: 10,
      marginBottom: 8,
      flexDirection:
        "row",
      justifyContent:
        "space-between",
      alignItems:
        "center",
    },

    itemAmount: {
      fontSize: 16,
      fontWeight: "600",
    },

    itemTime: {},

    historyButton: {
      borderWidth: 1,
      borderRadius: 14,
      padding: 16,
      marginBottom: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    historyButtonTitle: {
      fontSize: 16,
      fontWeight: "800",
    },

    historyButtonSubtitle: {
      fontSize: 12,
      marginTop: 4,
    },

    historyButtonArrow: {
      fontSize: 30,
      fontWeight: "300",
      marginLeft: 12,
    },

    historyCard: {
      padding: 16,
      borderRadius: 14,
      marginBottom: 12,
    },

    historyTitle: {
      fontSize: 17,
      fontWeight: "800",
      marginBottom: 12,
    },

    historyItem: {
      padding: 13,
      borderRadius: 12,
      marginBottom: 8,
    },

    historyTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },

    historyDate: {
      fontSize: 15,
      fontWeight: "700",
    },

    historyAmount: {
      fontSize: 15,
      fontWeight: "800",
    },

    historyDetail: {
      fontSize: 12,
      marginTop: 3,
    },

    historyStatus: {
      fontSize: 12,
      fontWeight: "700",
      marginTop: 7,
    },

    emptyHistory: {
      textAlign: "center",
      paddingVertical: 8,
    },

    empty: {
      textAlign:
        "center",
      marginTop: 24,
      marginBottom: 20,
    },
  });