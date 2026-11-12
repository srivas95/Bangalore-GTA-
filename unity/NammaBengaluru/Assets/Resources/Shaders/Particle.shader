// Soft round particles (the point sprites of src/systems/particles.js): vertex colour and alpha,
// alpha falling off as (1 - r)^2 towards the rim. Alpha-blended or additive (the _Additive pass
// state is set from Particles.cs through _SrcBlend/_DstBlend).
Shader "NammaBengaluru/Particle"
{
    Properties
    {
        [Enum(UnityEngine.Rendering.BlendMode)] _SrcBlend ("Src", Float) = 5
        [Enum(UnityEngine.Rendering.BlendMode)] _DstBlend ("Dst", Float) = 10
    }
    SubShader
    {
        Tags { "Queue" = "Transparent" "RenderType" = "Transparent" "RenderPipeline" = "UniversalPipeline" "IgnoreProjector" = "True" }
        Blend [_SrcBlend] [_DstBlend]
        ZWrite Off Cull Off
        Pass
        {
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            struct A { float4 positionOS : POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; };
            struct V { float4 positionCS : SV_POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; float fog : TEXCOORD1; };
            V Vert(A v)
            {
                V o;
                o.positionCS = TransformObjectToHClip(v.positionOS.xyz);
                o.color = v.color; o.uv = v.uv;
                o.fog = ComputeFogFactor(o.positionCS.z);
                return o;
            }
            half4 Frag(V i) : SV_Target
            {
                float2 d = i.uv - 0.5; float r = dot(d, d) * 4.0;
                clip(1.0 - r);
                half a = i.color.a * (1.0 - r) * (1.0 - r);
                half3 c = MixFog(i.color.rgb, i.fog);
                return half4(c, a);
            }
            ENDHLSL
        }
    }
}
