from django.urls import path

from .views import (
    register,
    account,
    workout_list,
    workout_sets,
    routine_list,
    routine_detail,
    routine_exercises,
    water_list,
    water_settings,
    water_detail,
)


urlpatterns = [

  
# =====================================================
# AUTH
# =====================================================

path(
    "register/",
    register,
    name="register"
),

path(
    "account/",
    account,
    name="account"
),




    # =====================================================
    # WORKOUTS
    # =====================================================

    path(
        "workouts/",
        workout_list,
        name="workout-list"
    ),

    path(
        "workouts/<int:workout_id>/sets/",
        workout_sets,
        name="workout-sets"
    ),


    # =====================================================
    # ROUTINES
    # =====================================================

    path(
        "routines/",
        routine_list,
        name="routine-list"
    ),

    path(
        "routines/<int:routine_id>/",
        routine_detail,
        name="routine-detail"
    ),

    path(
        "routines/<int:routine_id>/exercises/",
        routine_exercises,
        name="routine-exercises"
    ),


    # =====================================================
    # WATER
    # =====================================================

    path(
        "water/",
        water_list,
        name="water-list"
    ),

    path(
        "water/settings/",
        water_settings,
        name="water-settings"
    ),

    path(
        "water/<int:water_id>/",
        water_detail,
        name="water-detail"
    ),
]