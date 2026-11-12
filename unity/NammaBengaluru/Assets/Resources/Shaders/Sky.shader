// The sky (src/world/sky.js, simplified): zenith-to-horizon gradient, a warm glow around the
// sun, the sun disc, the moon and stars at night. Colours are set every frame by Environment.
Shader "NammaBengaluru/Sky"
{
    Properties
    {
        _Zenith ("Zenith", Color) = (0.24, 0.48, 0.81, 1)
        _Horizon ("Horizon", Color) = (0.73, 0.82, 0.9, 1)
        _Glow ("Sun-side glow", Color) = (0.13, 0.12, 0.09, 1)
        _SunDir ("Sun direction (Unity)", Vector) = (0, 1, 0, 0)
        _SunVis ("Sun visible", Float) = 1
        _Stars ("Stars", Float) = 0
        _Moon ("Moon", Float) = 0
    }
    SubShader
    {
        Tags { "Queue" = "Background" "RenderType" = "Background" "PreviewType" = "Skybox" "RenderPipeline" = "UniversalPipeline" }
        Cull Off ZWrite Off
        Pass
        {
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            half4 _Zenith, _Horizon, _Glow;
            float4 _SunDir;
            half _SunVis, _Stars, _Moon;
            struct A { float4 positionOS : POSITION; };
            struct V { float4 positionCS : SV_POSITION; float3 dir : TEXCOORD0; };
            V Vert(A v) { V o; o.positionCS = TransformObjectToHClip(v.positionOS.xyz); o.dir = v.positionOS.xyz; return o; }
            float Hash(float3 p) { return frac(sin(dot(p, float3(12.9898, 78.233, 37.719))) * 43758.5453); }
            half4 Frag(V i) : SV_Target
            {
                float3 d = normalize(i.dir);
                float h = d.y;
                half3 col = lerp(_Horizon.rgb, _Zenith.rgb, pow(saturate(h), 0.55));
                col = lerp(col, _Horizon.rgb * 0.55, smoothstep(0.0, -0.25, h)); // below the horizon
                float3 s = normalize(_SunDir.xyz);
                float c = dot(d, s);
                col += _Glow.rgb * pow(saturate(c * 0.5 + 0.5), 6) * 2.0;
                col += half3(1.0, 0.92, 0.8) * smoothstep(0.9993, 0.9997, c) * 6 * _SunVis;
                // Night: a few stars, and a pale moon opposite the sun.
                float3 g = floor(d * 300);
                float star = step(0.9975, Hash(g)) * saturate(h * 4);
                col += star * _Stars * 0.8;
                col += half3(0.8, 0.86, 1.0) * smoothstep(0.9990, 0.9994, dot(d, -s)) * 2.5 * _Moon;
                return half4(col, 1);
            }
            ENDHLSL
        }
    }
}
