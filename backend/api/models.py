from django.db import models
from django.contrib.auth.models import User


# =========================================================
# WORKOUT
# =========================================================

class Workout(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="workouts"
    )

    name = models.CharField(max_length=100)

    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(
        null=True,
        blank=True
    )

    def __str__(self):
        return self.name


# =========================================================
# WORKOUT SET
# =========================================================

class WorkoutSet(models.Model):
    workout = models.ForeignKey(
        Workout,
        on_delete=models.CASCADE,
        related_name="sets"
    )

    exercise = models.CharField(max_length=100)
    weight = models.FloatField()
    reps = models.IntegerField()

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return f"{self.exercise} - {self.weight}kg x {self.reps}"


# =========================================================
# ROUTINE
# =========================================================

class Routine(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="routines"
    )

    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


# =========================================================
# ROUTINE EXERCISE
# =========================================================

class RoutineExercise(models.Model):
    routine = models.ForeignKey(
        Routine,
        on_delete=models.CASCADE,
        related_name="exercises"
    )

    exercise = models.CharField(max_length=100)

    position = models.IntegerField(
        default=0
    )

    def __str__(self):
        return f"{self.routine.name} - {self.exercise}"


# =========================================================
# WATER LOG
# =========================================================

class WaterLog(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="water_logs"
    )

    amount_ml = models.IntegerField()

    created_at = models.DateTimeField()

    def __str__(self):
        return f"{self.user.username} - {self.amount_ml}ml"


# =========================================================
# WATER SETTINGS
# =========================================================

class WaterSettings(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="water_settings"
    )

    weight_kg = models.FloatField(
        null=True,
        blank=True
    )

    activity_level = models.CharField(
        max_length=30,
        default="moderate"
    )

    custom_goal_ml = models.IntegerField(
        null=True,
        blank=True
    )

    taking_creatine = models.BooleanField(
        default=False
    )

    creatine_grams = models.FloatField(
        default=0
    )

    def __str__(self):
        return f"{self.user.username} - Water Settings"