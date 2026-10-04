# Reglas de R8/ProGuard de MiQuiosco.
#
# QUÉ HACE FALTA AQUÍ Y QUÉ NO
# Capacitor ya trae lo suyo en @capacitor/android: mantiene toda clase que
# extienda com.getcapacitor.Plugin, o sea TODOS los plugins (biometría,
# secure-storage, sqlite, app, filesystem, network, preferences). Los plugins
# se descubren con el procesador de anotaciones, no por reflexión, así que
# R8 los puede renombrar sin romper el arranque.
#
# androidx.biometric, androidx.room y androidx.appcompat también traen sus
# propias reglas consumidor. Lo que queda abajo es lo que no se conserva solo y
# sí se resuelve por reflexión en runtime.

# Sin esto, R8 elimina las anotaciones y las firmas que usa la reflexión para
# leer clases y métodos.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
-keepattributes SourceFile, LineNumberTable

# Tink — lo usa @aparajita/capacitor-secure-storage por debajo de
# EncryptedSharedPreferences, que es donde se guarda el hash del PIN. Tink
# registra sus gestores de clave por reflexión: si R8 los renombra, el keystore
# deja poder descifrar y el login con huella y PIN se cae en el mostrador.
-keep class com.google.crypto.tink.** { *; }
-keep interface com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**

# Room — lo usa @capacitor-community/sqlite. El DAO lo genera el procesador de
# anotaciones, pero los conversores de tipos y la clase @Database se resuelven
# por reflexión.
-keep class androidx.room.** { *; }
-dontwarn androidx.room.paging.**

# Los dos plugins que traen lógica propia fuera de androidx: se mantienen
# enteros para que sus nombres de clase sobrevivan al log de arranque y a
# cualquier búsqueda por nombre.
-keep class com.aparajita.capacitor.** { *; }
-keep class com.getcapacitor.community.database.sqlite.** { *; }